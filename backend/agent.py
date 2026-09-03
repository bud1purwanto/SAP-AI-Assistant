import json
import asyncio
import logging
import time
import re
from datetime import datetime
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage, AIMessage
from mcp_manager import mcp_manager
from artifacts import ARTIFACT_PROMPT, extract_and_build
from conversation import trim_history
from models import ChatRequest, ChatResponse, SourceReference, UsageStats
from config import settings

logger = logging.getLogger(__name__)

# Penanda yang membuat teks perlu dibersihkan sebelum ditampilkan. Selama
# tidak ada satu pun di dalamnya, potongan aliran dapat diteruskan apa adanya.
_PERLU_BERSIH = re.compile(r'<think|```|thinking process|let me think', re.IGNORECASE)
_THINK_OPEN = re.compile(r'<think(?:ing)?>', re.IGNORECASE)
_THINK_CLOSE = re.compile(r'</think(?:ing)?>', re.IGNORECASE)


def _clean_thinking_process(text: str) -> str:
    """Buang jejak penalaran internal model tanpa merusak isi jawaban.

    Versi sebelumnya memotong teks pada kemunculan pertama emoji (`text[text.find("📦"):]`)
    dan menghapus paragraf berbahasa Inggris dengan regex longgar. Selama jawaban
    selalu berupa laporan SAP berformat tetap hal itu jarang terlihat, tetapi untuk
    jawaban serbaguna (tabel, ringkasan, kode, teks campuran) pemotongan itu
    membuang isi yang sah. Sekarang yang dibuang hanya penanda penalaran yang eksplisit.
    """
    if not text:
        return ""

    # 1. Tag penalaran eksplisit dari model reasoning.
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<thinking>.*?</thinking>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Tag pembuka tanpa penutup (respons terpotong).
    text = re.sub(r'<think(?:ing)?>.*\Z', '', text, flags=re.DOTALL | re.IGNORECASE)

    # 2. Preambul "Here's a thinking process: ..." sampai baris kosong pertama.
    text = re.sub(
        r"\A\s*(?:Here'?s? (?:a|my) thinking process|Let me think|Thinking process)\s*:.*?(?:\n\s*\n|\Z)",
        '',
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # 3. Panggilan tool yang terlanjur ditulis sebagai teks (bukan function call).
    text = re.sub(r'```(?:abap|query|json)?\s*(?:sap__|rag__)\w+\s*\(.*?```', '', text, flags=re.DOTALL | re.IGNORECASE)

    return text.strip()


def _chunk_text(content) -> str:
    """Teks mentah dari satu potongan aliran, tanpa pembersihan apa pun.

    `_extract_text` tidak boleh dipakai per potongan: ia diakhiri `.strip()`,
    sehingga spasi di tepi setiap potongan hilang dan kata-kata menyatu —
    "Stok material SRRPAI" menjadi "StokmaterialSRRPAI". Regex pembersihnya juga
    mengasumsikan teks utuh, sehingga penanda yang terbelah antar potongan tidak
    dikenali. Pembersihan dilakukan sekali di akhir atas teks yang sudah lengkap.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict):
                parts.append(p.get("text") or p.get("content") or "")
        return "".join(parts)
    return str(content or "")


def _extract_text(content) -> str:
    """Ambil teks dari content AIMessage dan bersihkan dari teks pemikiran internal."""
    raw_text = ""
    if isinstance(content, str):
        raw_text = content
    elif isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict):
                parts.append(p.get("text") or p.get("content") or "")
        raw_text = "".join(parts)
    else:
        raw_text = str(content or "")
        
    return _clean_thinking_process(raw_text)

# Peran yang berhak menjalankan tool pengubah program.
PERAN_BOLEH_UBAH_PROGRAM = ("superadmin", "abaper")

# Kata kerja yang menandakan sebuah tool MENGUBAH sesuatu di SAP, bukan sekadar
# membaca. Daftar tool MCP dapat berubah tanpa sepengetahuan aplikasi, jadi
# yang dipakai adalah pola nama — dan bila ragu, tool DITOLAK untuk peran yang
# tidak berhak. Salah menolak hanya merepotkan; salah mengizinkan dapat
# mengubah program di sistem SAP.
_POLA_UBAH = (
    "write", "create", "update", "modify", "change", "delete", "remove",
    "insert", "activate", "deactivate", "transport", "commit", "execute_abap",
    "run_abap", "set_", "upload", "deploy", "rename",
)


def tool_mengubah_program(tool_name: str) -> bool:
    """Tebak apakah sebuah tool mengubah objek di SAP."""
    nama = (tool_name or "").lower()
    return any(pola in nama for pola in _POLA_UBAH)


def _describe_tool(server: str, tool_name: str, args: dict = None) -> str:
    """Terjemahkan pemanggilan tool menjadi keterangan yang dipahami pengguna."""
    name = (tool_name or "").lower()
    if server == "rag":
        return "Mencari di dokumen internal…"
    if server in ("sql", "database"):
        if "query" in name or "read" in name:
            return "Menjalankan query SQL database…"
        return "Memproses layanan MCP SQL…"
    if server == "email":
        if "send" in name:
            return "Mengirim email via MCP Email…"
        return "Memproses layanan MCP Email…"

    table = ""
    if isinstance(args, dict):
        table = args.get("table") or args.get("table_name") or ""

    if "read_table" in name:
        return f"Membaca tabel {table} di SAP…" if table else "Membaca tabel data SAP…"
    if "program" in name:
        return "Membaca program ABAP…"
    if "function" in name:
        return "Menjalankan fungsi SAP…"
    if "search" in name:
        return "Mencari data di SAP…"
    return "Mengambil data dari SAP…"


def _looks_like_vision_error(error: Exception) -> bool:
    """Tebak apakah kegagalan disebabkan lampiran gambar, bukan hal lain."""
    text = str(error).lower()
    markers = ("image", "vision", "multimodal", "image_url", "content type", "unsupported")
    return any(marker in text for marker in markers)


def _strip_images(messages: list) -> list:
    """Buang bagian gambar dari pesan, sisakan teksnya."""
    cleaned = []
    for message in messages:
        if isinstance(getattr(message, "content", None), list):
            text = " ".join(
                part.get("text", "")
                for part in message.content
                if isinstance(part, dict) and part.get("type") == "text"
            ).strip()
            cleaned.append(
                HumanMessage(content=(
                    text + "\n\n(Catatan: gambar tidak dapat diproses oleh model yang aktif; "
                    "jawab berdasarkan teks yang ada dan minta pengguna menjelaskan isi gambar "
                    "bila diperlukan.)"
                ))
            )
        else:
            cleaned.append(message)
    return cleaned


def _buat_llm(provider: str, model_name: str, sys_cfg: dict, max_tokens: int = 4096, temperature: float = None):
    """Buat instance ChatOpenAI sesuai provider ('nine_router' atau 'openrouter') dan model."""
    prov = (provider or "").lower().strip()
    extra_kwargs = {}
    if temperature is not None:
        extra_kwargs["temperature"] = temperature

    if prov in ("nine_router", "9router", "local"):
        nine_router_base_url = sys_cfg.get("nine_router_base_url") or settings.nine_router_base_url or "http://192.168.88.83:20128/v1"
        nine_router_api_key = sys_cfg.get("nine_router_api_key") or settings.nine_router_api_key or "sk-9router-local"
        return ChatOpenAI(
            model=model_name or "ag/gemini-3.7-flash-medium",
            openai_api_key=nine_router_api_key,
            openai_api_base=nine_router_base_url,
            max_retries=1,
            max_tokens=max_tokens,
            **extra_kwargs,
        )
    elif prov == "openrouter":
        openrouter_api_key = sys_cfg.get("openrouter_api_key") or settings.openrouter_api_key
        if not openrouter_api_key or openrouter_api_key == "your_openrouter_api_key_here":
            return None
        return ChatOpenAI(
            model=model_name or "openrouter/free",
            openai_api_key=openrouter_api_key,
            openai_api_base="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "https://github.com/bud1purwanto/SAP-AI-Assistant",
                "X-Title": "SAP AI Assistant",
            },
            max_retries=1,
            max_tokens=max_tokens,
            **extra_kwargs,
        )
    return None


async def _noop_progress(**kwargs):
    """Penerima progres bawaan untuk pemanggil yang tidak memerlukannya."""


async def process_chat(chat_req: ChatRequest, user_role: str = "user", user_persona: str = "",
                       username: str = "Guest", on_progress=None, on_token=None) -> ChatResponse:
    # 0. Resolusi Mode Chat & Batas Iterasi
    from database import (
        get_system_config,
        get_chat_mode_by_code,
        get_default_chat_mode,
        get_modes_for_role,
    )
    sys_cfg = get_system_config()

    chat_modes_enabled = sys_cfg.get("chat_modes_enabled", True)
    active_mode = None
    if chat_modes_enabled and chat_req.mode:
        target = get_chat_mode_by_code(chat_req.mode)
        if target and target.get("enabled"):
            user_modes = get_modes_for_role(user_role)
            if any(m["code"] == target["code"] and m.get("available") for m in user_modes):
                active_mode = target

    if not active_mode:
        active_mode = get_default_chat_mode()

    if active_mode:
        MAX_ITERATIONS = int(active_mode.get("max_iterations") or 15)
        primary_provider = active_mode.get("provider") or "nine_router"
        mode_model = active_mode.get("model")
        if not mode_model or (primary_provider == "nine_router" and sys_cfg.get("nine_router_model") and not chat_req.mode):
            primary_model_name = sys_cfg.get("nine_router_model") or mode_model or "ag/gemini-3.7-flash-medium"
        else:
            primary_model_name = mode_model or "ag/gemini-3.7-flash-medium"
        fallback_provider = active_mode.get("fallback_provider") or "openrouter"
        fallback_model_name = active_mode.get("fallback_model") or sys_cfg.get("openrouter_fallback_model") or "openrouter/free"
    else:
        MAX_ITERATIONS = 15
        nine_router_enabled = sys_cfg.get("nine_router_enabled", True)
        primary_provider = "nine_router" if nine_router_enabled else "openrouter"
        primary_model_name = sys_cfg.get("nine_router_model") if nine_router_enabled else (sys_cfg.get("openrouter_model") or "openrouter/auto")
        fallback_provider = "openrouter"
        fallback_model_name = sys_cfg.get("openrouter_fallback_model") or "openrouter/free"

    # Progres dilaporkan sebagai tahapan nyata (bukan perkiraan waktu): langkah
    # keberapa dari batas iterasi agen, beserta keterangan yang sedang dikerjakan.
    progress = on_progress or _noop_progress

    async def report(stage: str, label: str, step: int = 0):
        try:
            await progress(stage=stage, label=label, step=step, max_steps=MAX_ITERATIONS)
        except Exception as e:  # progres tidak boleh menjatuhkan percakapan
            logger.warning(f"Gagal mengirim progres: {e}")

    # --- STREAMING TEKS JAWABAN ---
    #
    # Model dipanggil dengan .astream() bila pemanggil menyediakan `on_token`,
    # sehingga jawaban muncul sambil ditulis alih-alih menunggu selesai.
    #
    # Satu putaran agen belum tentu menghasilkan jawaban akhir: model bisa
    # memanggil tool, membocorkan penalaran, atau balasannya kosong. Bila itu
    # terjadi, teks yang terlanjur mengalir dibatalkan lewat `reset_stream()`
    # agar antarmuka tidak menampilkan jawaban yang kemudian dibuang.
    streaming = on_token is not None

    # --- PEMAKAIAN TOKEN ---
    #
    # Angka diambil dari yang dilaporkan provider (usage_metadata milik
    # LangChain), bukan dihitung sendiri. Perkiraan lokal akan meleset karena
    # tokenizer tiap model berbeda, dan angka yang salah lebih buruk daripada
    # tidak ada angka — jadi bila provider diam, nilainya dibiarkan kosong.
    mulai_ns = time.perf_counter_ns()
    pemakaian = {"prompt": 0, "completion": 0, "cached": 0, "ada": False, "tool_calls": 0}

    def catat_pemakaian(pesan):
        data = getattr(pesan, "usage_metadata", None) or {}
        if not data:
            return
        pemakaian["ada"] = True
        pemakaian["prompt"] += int(data.get("input_tokens") or 0)
        pemakaian["completion"] += int(data.get("output_tokens") or 0)
        rincian = data.get("input_token_details") or {}
        pemakaian["cached"] += int(rincian.get("cache_read") or 0)

    async def emit_token(text: str):
        try:
            await on_token(text=text)
        except Exception as e:
            logger.warning(f"Gagal mengirim token: {e}")

    async def reset_stream():
        if streaming:
            try:
                await on_token(reset=True)
            except Exception as e:
                logger.warning(f"Gagal mereset aliran token: {e}")

    async def call_model(model, msgs):
        """Panggil model; alirkan teksnya bila streaming diaktifkan.

        Menggabungkan chunk memakai operator `+` milik AIMessageChunk sehingga
        tool_calls tetap tersusun utuh seperti hasil ainvoke().

        Teks dikirim apa adanya. Potongan tidak boleh dibersihkan satu per satu
        (lihat `_chunk_text`); yang tampil di layar diganti oleh jawaban final
        yang sudah dibersihkan begitu permintaan selesai. Satu-satunya yang
        ditahan di sini adalah isi blok penalaran <think>, karena membiarkannya
        muncul lalu menghilang justru membingungkan.
        """
        if not streaming:
            hasil = await model.ainvoke(msgs)
            catat_pemakaian(hasil)
            return hasil

        merged = None
        terkumpul = ""
        terkirim = ""
        is_tool_call = False

        try:
            async for chunk in model.astream(msgs):
                merged = chunk if merged is None else merged + chunk

                # Deteksi awal apakah model sedang memanggil tool
                if getattr(chunk, "tool_call_chunks", None) or getattr(chunk, "tool_calls", None):
                    is_tool_call = True
                    if terkirim:
                        await reset_stream()
                        terkirim = ""
                    continue

                if is_tool_call:
                    continue

                potongan = _chunk_text(chunk.content)
                if not potongan:
                    continue
                terkumpul += potongan

                # Jalur cepat: selama tidak ada penanda penalaran yang perlu dibersihkan,
                # potongan diteruskan apa adanya agar jawaban mengalir bertahap secara alami.
                if not _PERLU_BERSIH.search(terkumpul):
                    terkirim += potongan
                    await emit_token(potongan)
                    continue

                # Tahan selama blok penalaran belum ditutup.
                if _THINK_OPEN.search(terkumpul) and not _THINK_CLOSE.search(terkumpul):
                    continue

                tampil = _clean_thinking_process(terkumpul)
                if tampil == terkirim:
                    continue
                if tampil.startswith(terkirim):
                    await emit_token(tampil[len(terkirim):])
                else:
                    # Pembersihan membuang bagian yang sudah tampil di layar
                    # (mis. blok penalaran baru saja ditutup): mulai dari awal
                    # daripada meninggalkan teks yang keliru.
                    await reset_stream()
                    if tampil:
                        await emit_token(tampil)
                terkirim = tampil
        except Exception:
            # Sebagian teks mungkin sudah terkirim sebelum gagal.
            await reset_stream()
            raise

        if merged is None:
            # Provider menutup aliran tanpa mengirim apa pun.
            hasil = await model.ainvoke(msgs)
            catat_pemakaian(hasil)
            return hasil

        catat_pemakaian(merged)

        # Bila putaran ini memanggil tool, pastikan stream bersih (teks pengantar tidak tampil di bubble chat)
        if getattr(merged, "tool_calls", None):
            if terkirim:
                await reset_stream()
            return merged

        # Bila ini adalah jawaban akhir (tanpa tool) dan belum terkirim karena berada di bawah batas buffer:
        tampil_akhir = _clean_thinking_process(terkumpul)
        if tampil_akhir and not terkirim:
            await emit_token(tampil_akhir)
        elif tampil_akhir and len(tampil_akhir) > len(terkirim) and tampil_akhir.startswith(terkirim):
            await emit_token(tampil_akhir[len(terkirim):])

        return merged

    await report("connecting", "Menyiapkan permintaan…")

    # 1. Ambil tools dari MCP (berdasarkan server yang dipilih dan otorisasi pengguna)
    target_srv = chat_req.active_server or chat_req.server or chat_req.selected_server or "sap"
    # Target SAP/SQL dibawa per-request dan diterapkan ulang di setiap pemanggilan
    # tool (lihat mcp_manager.call_tool). Menetapkannya sekali di awal tidak
    # aman: user lain dapat menggesernya sebelum tool ini benar-benar dijalankan.
    target_system = "sql" if target_srv.startswith("sql:") else "sap"
    sap_target = (
        target_srv.split(":", 1)[1]
        if ":" in target_srv
        else (target_srv if target_srv not in ("sap", "sql") else None)
    )
    if sap_target:
        logger.info(f"Target {target_system.upper()} server untuk request ini: {sap_target}")

    # Validasi otorisasi target_srv terhadap pengguna (bila master switch aktif)
    import access_control
    access_control.assert_can_use(username=username, role=user_role, active_server=target_srv)

    allowed_conn = access_control.allowed_connectors(username=username, role=user_role)
    try:
        all_mcp_tools = await mcp_manager.get_all_tools(server_filter=target_srv, allowed_connectors=allowed_conn)
    except TypeError:
        all_mcp_tools = await mcp_manager.get_all_tools(server_filter=target_srv)
    
    if not all_mcp_tools:
        return ChatResponse(
            reply=(
                "⚠️ **Koneksi ke sistem target terputus atau tidak diizinkan**\n\n"
                "Saya belum bisa mengambil data dari sistem maupun basis dokumen internal "
                "saat ini. Silakan coba beberapa saat lagi, atau hubungi administrator bila "
                "berlanjut.\n\n"
                "Anda tetap bisa bertanya hal umum atau melampirkan berkas untuk saya bantu olah."
            ),
            sources=[]
        )
        
    has_sap = any(item["server"] == "sap" for item in all_mcp_tools)
    has_rag = any(item["server"] == "rag" for item in all_mcp_tools)
    has_sql = any(item["server"] in ("sql", "database") for item in all_mcp_tools)
    has_email = any(item["server"] == "email" for item in all_mcp_tools)
    
    # 2. Konversi tools MCP ke format OpenAI tools
    openai_tools = []
    tool_map = {} # map dari openai_tool_name ke (server_name, mcp_tool_name)
    
    can_write_res = True
    if access_control.is_access_control_enabled():
        can_key = access_control.canonical_resource_key(target_srv)
        u_perms = access_control.resolve_access(username, user_role)
        can_write_res = bool(u_perms.get(can_key, {}).get("can_write"))

    boleh_ubah = ((user_role or "").lower() in PERAN_BOLEH_UBAH_PROGRAM) and can_write_res
    tool_ditolak = []

    for item in all_mcp_tools:
        server = item["server"]
        t = item["tool"]
        tool_name = f"{server}__{t.name}".replace("-", "_")

        # Tool pengubah program tidak sekadar disembunyikan dari prompt: ia
        # tidak dibuatkan definisinya sama sekali, sehingga model tidak punya
        # cara memanggilnya walau diminta pengguna.
        if server == "sap" and not boleh_ubah and tool_mengubah_program(t.name):
            tool_ditolak.append(t.name)
            continue
        
        # Pangkas deskripsi tool agar efisien dalam limit input token model gratis
        desc = (t.description or f"Tool {t.name} dari {server}")
        if len(desc) > 300:
            desc = desc[:300] + "..."
            
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool_name,
                "description": desc,
                "parameters": t.inputSchema
            }
        })
        tool_map[tool_name] = {"server": server, "mcp_name": t.name}

    # 3. Setup LLM (Berdasarkan konfigurasi mode chat & fallback provider)
    llm_primary = _buat_llm(primary_provider, primary_model_name, sys_cfg)
    llm_fallback = _buat_llm(fallback_provider, fallback_model_name, sys_cfg)

    # Fallback jika salah satu provider tidak terkonfigurasi (misal API key OpenRouter kosong)
    if llm_primary is None and llm_fallback is not None:
        llm_primary = llm_fallback
        primary_model_name = fallback_model_name
    elif llm_fallback is None and llm_primary is not None:
        llm_fallback = llm_primary
        fallback_model_name = primary_model_name
    elif llm_primary is None and llm_fallback is None:
        return ChatResponse(
            reply="Mohon maaf, tidak ada AI Provider yang aktif atau terkonfigurasi untuk mode ini. Silakan hubungi Administrator.",
            sources=[]
        )

    if openai_tools:
        llm_primary_force = llm_primary.bind_tools(openai_tools, tool_choice="required")
        llm_primary_auto = llm_primary.bind_tools(openai_tools)
        llm_fallback_force = llm_fallback.bind_tools(openai_tools, tool_choice="required")
        llm_fallback_auto = llm_fallback.bind_tools(openai_tools)
    else:
        llm_primary_force = llm_primary
        llm_primary_auto = llm_primary
        llm_fallback_force = llm_fallback
        llm_fallback_auto = llm_fallback

    # Pemetaan metadata sub-server SAP
    sub_servers_meta = {
        "dev": ("Development AIX", "TRD"),
        "dev-aix": ("Development AIX", "TRD"),
        "development": ("Development AIX", "TRD"),
        "dev-win": ("Development Windows", "TRD"),
        "dev-windows": ("Development Windows", "TRD"),
        "prod": ("Production AIX", "PRT"),
        "prod-aix": ("Production AIX", "PRT"),
        "production": ("Production AIX", "PRT"),
        "prd": ("Production AIX", "PRT"),
        "prod-win": ("Production Windows", "TRP"),
        "prod-windows": ("Production Windows", "TRP"),
        "prp": ("Production Windows", "TRP"),
        "qa": ("QA", "TRQ"),
        "quality": ("QA", "TRQ"),
        "test": ("QA", "TRQ"),
        "sandbox": ("Sandbox Build Competence", "TRD"),
        "sandbox-build": ("Sandbox Build Competence", "TRD"),
        "build-competence": ("Sandbox Build Competence", "TRD"),
        "sandbox-new": ("Sandbox New Company", "TRS"),
        "new-company": ("Sandbox New Company", "TRS")
    }

    sap_server_name = "Sandbox New Company"
    sap_sid = "TRS"
    sql_server_name = "SQL Database"
    
    if target_srv.startswith("sap:"):
        sap_alias = target_srv.split(":", 1)[1].lower()
        if sap_alias in sub_servers_meta:
            sap_server_name, sap_sid = sub_servers_meta[sap_alias]
        else:
            sap_server_name = sap_alias.upper()
    elif target_srv.startswith("sql:"):
        sql_alias = target_srv.split(":", 1)[1]
        sql_server_name = sql_alias
    elif target_system == "sql" and sap_target:
        sql_server_name = sap_target

    # ------------------------------------------------------------------
    # SYSTEM PROMPT
    # ------------------------------------------------------------------
    tool_inventory = []
    if target_system == "sql":
        if has_sql:
            tool_inventory.append(f"layanan MCP SQL Database (target server: **{sql_server_name}**)")
        if has_rag:
            tool_inventory.append("basis pengetahuan dokumen (RAG)")
    else:
        if has_sap:
            tool_inventory.append(f"data live SAP pada server **{sap_server_name} (SID: {sap_sid})**")
        if has_rag:
            tool_inventory.append("basis pengetahuan dokumen (RAG)")
        if has_sql:
            tool_inventory.append("layanan MCP SQL Database")
    if has_email:
        tool_inventory.append("layanan MCP Email")
    inventory_line = " dan ".join(tool_inventory) if tool_inventory else "tidak ada sumber data eksternal"

    # SUSUNAN PROMPT DAN CACHING
    if tool_ditolak:
        logger.info(
            f"Peran '{user_role}' tidak berhak mengubah program; "
            f"{len(tool_ditolak)} tool disembunyikan: {', '.join(tool_ditolak[:6])}"
        )

    if target_system == "sql":
        approach_a = (
            f"**A. Permintaan data / investigasi SQL Database** (cek database, tabel, kolom, view, record, atau query SQL pada server **{sql_server_name}**)\n"
            f"   -> WAJIB panggil tool MCP SQL (`sql__sql_list_databases`, `sql__sql_list_tables`, `sql__sql_describe_table`, `sql__sql_run_query`, dsb.) untuk mengambil data LIVE dari database SQL.\n"
            f"   -> Server SQL aktif yang dipilih pengguna adalah **{sql_server_name}**. Jalankan inspeksi dan query langsung ke server SQL tersebut.\n"
            f"   -> JANGAN mencari ke SAP atau menyebut sistem SAP, karena pengguna secara spesifik memilih koneksi ke SQL Database ({sql_server_name}).\n\n"
        )
        format_source_rule = (
            f"2. Jika jawaban mengambil data live dari SQL Database, sertakan indikator sumber data "
            f"berformat: 📦 **Data langsung dari database SQL: {sql_server_name}**\n"
            f"   Gunakan tool SQL untuk memeriksa dan membaca tabel/data pada server {sql_server_name}. "
            f"   DILARANG mengarahkan jawaban ke sistem SAP atau menulis 'Data langsung dari sistem SAP' "
            f"   karena pengguna secara tegas memilih target koneksi SQL Database ({sql_server_name}).\n"
        )
    else:
        approach_a = (
            f"**A. Permintaan data SAP nyata** (stock material, plant, PO/SO, vendor, isi tabel "
            f"MARA/MARC/MARD/T001W/EKKO/VBAK, kode ABAP, status dokumen, dsb.)\n"
            f"   -> WAJIB panggil tool MCP SAP untuk mengambil data LIVE. Jangan mengarang angka.\n"
            f"   -> Contoh: cek plant material 'SRRPAI' -> `sap__read_table` dengan `table: 'MARC'`, "
            f"`where: [\"MATNR = 'SRRPAI'\"]`, atau `sap__sap_read_table` dengan `table_name: 'MARC'`, "
            f"`options: [\"MATNR = 'SRRPAI'\"]`.\n"
            f"   -> Server SAP aktif SUDAH dipilih pengguna lewat antarmuka. Jangan bertanya ulang "
            f"soal pilihan server dan jangan menolak permintaan data.\n\n"
        )
        format_source_rule = (
            f"2. Jika jawaban mengambil data live dari SAP, sertakan indikator sumber data "
            f"berformat: 📦 **Data langsung dari sistem {sap_server_name}** — nama sistem SAP aktif "
            f"yang disebutkan pada bagian KONTEKS PERMINTAAN INI di bagian bawah prompt ini.\n"
            f"   Tulis dalam bahasa kerja sehari-hari; hindari istilah internal seperti SID, MCP, RAG, "
            f"atau nama tool kepada pengguna. Untuk jawaban yang TIDAK mengambil data SAP, JANGAN "
            f"tampilkan baris tersebut.\n"
        )

    system_prompt = (
        f"Anda adalah SAP & Enterprise Data AI Assistant: asisten kerja serbaguna untuk ekosistem SAP dan Database Enterprise.\n\n"

        f"## CARA MEMILIH PENDEKATAN\n"
        f"Tentukan dahulu jenis permintaan pengguna, lalu bertindak sesuai jenisnya:\n\n"
        f"{approach_a}"
        f"**B. Pertanyaan konseptual, panduan, prosedur, atau isi dokumen internal**\n"
        f"   -> Gunakan `rag__search` bila jawabannya kemungkinan ada di dokumen internal "
        f"(blueprint, SOP, manual). Bila tidak ditemukan, jawab dari pengetahuan Anda dan "
        f"katakan bahwa itu bukan dari dokumen internal.\n\n"
        f"**C. Permintaan yang menyertakan lampiran** (pengguna mengirim gambar atau dokumen)\n"
        f"   -> Isi berkas sudah disediakan untuk Anda dalam blok LAMPIRAN DARI PENGGUNA. "
        f"Baca dan gunakan isinya; jangan meminta pengguna menempelkan ulang isinya.\n"
        f"   -> Sebutkan nama berkas ketika jawaban Anda bersumber dari lampiran tersebut.\n"
        f"   -> Bila lampiran bertentangan dengan data sistem, sampaikan perbedaannya, jangan "
        f"memilih diam-diam salah satunya.\n\n"
        f"**D. Permintaan umum di luar data sistem** — menulis, meringkas, menerjemahkan, "
        f"menghitung, menyusun tabel/laporan, membuat berkas Excel/CSV, menjelaskan konsep, "
        f"membantu kode, brainstorming, atau sekadar menyapa.\n"
        f"   -> JAWAB LANGSUNG dengan kemampuan Anda sendiri. JANGAN memanggil tool sistem "
        f"hanya karena tool tersedia, dan JANGAN mengubah jawaban menjadi laporan investigasi yang tidak diminta.\n\n"
        f"Bila sebuah permintaan menggabungkan beberapa jenis (misalnya: ambil data lalu "
        f"rapikan jadi Excel), kerjakan berurutan: ambil datanya dulu, baru olah hasilnya.\n\n"
        f"**ATURAN PEMANGGILAN TOOL (PENTING):**\n"
        f"Ketika Anda memutuskan untuk memanggil tool (SAP, RAG, SQL, dsb.), panggil tool tersebut "
        f"secara langsung tanpa menulis kalimat pengantar atau narasi obrolan sebelumnya (misalnya: JANGAN katakan "
        f"'Sekarang saya akan...', 'Saya cari di RAG...', 'Tunggu sebentar...'). Seluruh penjelasan dan "
        f"jawaban akhir hanya ditulis setelah seluruh hasil data dari tool selesai diperoleh.\n\n"

        f"## MEMORI PERCAKAPAN\n"
        f"Anda memiliki akses ke riwayat percakapan sesi ini. Untuk pertanyaan lanjutan atau "
        f"rujukan ke data yang sudah dibahas, gunakan konteks tersebut dan jangan mengulang "
        f"pemanggilan tool bila datanya sudah ada. Jangan berhalusinasi atau mengabaikan "
        f"temuan sebelumnya.\n\n"

        f"## FORMAT JAWABAN\n"
        f"1. Responlah secara alami dalam bahasa yang digunakan oleh pengguna (English sebagai default utama, atau Bahasa Indonesia jika pengguna bertanya dalam Bahasa Indonesia). Pastikan struktur jawaban jelas, profesional, dan rapi.\n"
        f"{format_source_rule}"
        f"3. Sajikan data tabular sebagai tabel markdown yang rapi. Gunakan bullet ringkas untuk penjelasan.\n"
        f"4. Tulis nama tabel/field/tcode secara inline (contoh: `VBAP` & `VBAK`, `MARA` & `MARC`), "
        f"bukan sebagai blok kode terpisah per baris.\n"
        f"5. Gunakan blok kode hanya untuk kode program utuh yang memang perlu disalin.\n"
        f"5b. Untuk ALUR PROSES, urutan langkah, atau hubungan antar dokumen "
        f"(mis. Procure-to-Pay, alur rilis Production Order, siklus dokumen SD), "
        f"gambarkan sebagai diagram Mermaid dalam blok ```mermaid — antarmuka "
        f"menggambarnya menjadi bagan otomatis. Pakai `flowchart TD` untuk alur "
        f"proses dan `sequenceDiagram` untuk pertukaran antar sistem.\n"
        f"   ATURAN WAJIB MERMAID AGAR TIDAK PARSE ERROR:\n"
        f"   - SEMUA teks label simpul/node WAJIB dibungkus tanda kutip ganda, contoh: `A[\"Buat PR (ME51N)\"]` atau `B{{\"Cek Approval (ME28)?\"}}`.\n"
        f"   - DILARANG menulis tanda kurung `( )` tanpa tanda kutip ganda di dalam `[...]` atau `{{...}}`.\n"
        f"   - Label panah penghubung jika ada tanda baca harus dibungkus tanda kutip ganda, contoh: `-->|\"Disetujui (Approved)\"|`.\n"
        f"   - ID simpul DILARANG mengandung spasi (gunakan `Step_1` bukan `Step 1`).\n"
        f"   - Batasi sekitar 8-12 simpul agar bagan rapi dan terbaca jelas di layar ponsel. "
        f"Sertakan penjelasan singkat berupa teks di samping/bawah diagram — jangan hanya diagram saja.\n"
        f"6. HINDARI menuliskan format struktur, pola penomoran, atau rangkaian teks menggunakan sintaks LaTeX formula seperti `$$\\text{...}$$` atau `$...$`. Gunakan selalu format Markdown standar: inline code (misal `| a | b | c | d | e | f |`), tabel markdown, atau blok kode teks biasa agar bersih dan rapi.\n"
        f"7. Sebutkan dengan jujur bila data tidak ditemukan; jangan mengarang isi tabel SAP.\n"
        f"8. DILARANG menampilkan penalaran internal berbahasa Inggris seperti 'We need to answer...', "
        f"'We performed a RAG search...', atau 'Doc 1 snippet:'.\n"
        f"9. PEMBUATAN / EKSEKUSI TRANSAKSI & BAPI VIA RFC:\n"
        f"   - BEDAKAN SECARA TEGAS ANTARA MEMBACA DATA VS MEMBUAT DATA BARU:\n"
        f"     Bila pengguna berkata 'buatkan data testing', 'buatkan PO', 'bikin', 'generate', 'posting', atau 'buat transaksi via RFC', ini adalah perintah untuk MEMBUAT (CREATE/POST) DOKUMEN TRANSAKSI BARU di SAP melalui BAPI RFC (`call_function`), BUKAN membaca tabel data yang sudah ada (`read_table`).\n"
        f"     DILARANG KERAS hanya membaca tabel (misal membaca tabel EKKO) lalu menyodorkan nomor-nomor dokumen lama yang sudah ada seolah-olah itu data testing baru!\n"
        f"   - FITUR ATOMIC AUTO-COMMIT SISTEM:\n"
        f"     Backend sistem telah dilengkapi fitur Atomic Auto-Commit otomatis. Setiap kali Anda memanggil `BAPI_PO_CREATE1` (atau BAPI mutasi lainnya), sistem otomatis langsung mengeksekusi `BAPI_TRANSACTION_COMMIT` di dalam sesi koneksi PyRFC yang sama persis bila tidak ada error Type E/A. Anda TIDAK PERLU lagi memanggil `BAPI_TRANSACTION_COMMIT` terpisah!\n"
        f"   - PEMBUATAN BATCH DATA (MISAL 10 PURCHASE ORDER):\n"
        f"     Jika pengguna meminta 10 data PO, BUATKAN SEMUA 10 DATA TERSEBUT! Anda dapat memanggil tool `call_function` untuk `BAPI_PO_CREATE1` beberapa kali secara paralel atau berurutan dalam satu respons. Berikan sedikit variasi pada tiap PO (misal kuantitas 10, 15, 20, 25, 30... atau variasi delivery date).\n"
        f"   - TEMPLATE PARAMETER PO VALID DI SANDBOX NEW COMPANY (TRS):\n"
        f"     Gunakan parameter teruji berikut agar tidak membuang iterasi membaca tabel:\n"
        f"     * POHEADER: COMP_CODE='9999', DOC_TYPE='PO07', VENDOR='2131000399', PURCH_ORG='TPOL', PUR_GROUP='P01', DOC_DATE=tanggal server (misal '20290128')\n"
        f"     * POHEADERX: COMP_CODE='X', DOC_TYPE='X', VENDOR='X', PURCH_ORG='X', PUR_GROUP='X', DOC_DATE='X'\n"
        f"     * POITEM: [{{'PO_ITEM': '00010', 'MATERIAL': '000000001100000267', 'PLANT': '2000', 'STGE_LOC': '2002', 'QUANTITY': 10.0, 'PO_UNIT': 'KG', 'NET_PRICE': 425.0}}]\n"
        f"     * POITEMX: [{{'PO_ITEM': '00010', 'PO_ITEMX': 'X', 'MATERIAL': 'X', 'PLANT': 'X', 'STGE_LOC': 'X', 'QUANTITY': 'X', 'PO_UNIT': 'X', 'NET_PRICE': 'X'}}]\n"
        f"     * POSCHEDULE: [{{'PO_ITEM': '00010', 'SCHED_LINE': '0001', 'DELIVERY_DATE': tanggal server + 14 hari (misal '20290215'), 'QUANTITY': 10.0}}]\n"
        f"     * POSCHEDULEX: [{{'PO_ITEM': '00010', 'SCHED_LINE': '0001', 'PO_ITEMX': 'X', 'DELIVERY_DATE': 'X', 'QUANTITY': 'X'}}]\n"
        f"     (Catatan: DELIVERY_DATE wajib minimal 14 hari ke depan dari DOC_DATE).\n"
        f"   - Tampilkan tabel rekap lengkap seluruh nomor PO baru yang berhasil terbit (dari `EXPPURCHASEORDER` / pesan Type S 'PO created under number ...') secara jelas dan rapi kepada pengguna!\n\n"

        f"{ARTIFACT_PROMPT}\n"
    )

    # --- PERSONA BERLAPIS ---
    # Persona global (diatur admin) berlaku sebagai dasar untuk semua user;
    # persona milik user diterapkan di atasnya sebagai penyesuaian pribadi.
    # Sebelumnya persona user MENGGANTIKAN persona global sepenuhnya.
    global_persona = (sys_cfg.get("global_assistant_persona") or settings.assistant_persona or "").strip()
    personal_persona = (user_persona or "").strip()

    if global_persona:
        system_prompt += (
            f"\n--- PERSONA ORGANISASI (dasar, berlaku untuk semua pengguna) ---\n"
            f"{global_persona}\n"
            f"----------------------------------------------------------------\n"
        )
    if global_persona:
        system_prompt += "Patuhi persona organisasi di atas secara konsisten pada setiap balasan.\n"

    # --- KATALOG SKILL & SPESIALISASI ---
    try:
        from database import get_skills
        active_skills = get_skills(enabled_only=True)
    except Exception as e:
        logger.warning(f"Gagal memuat skill dari database: {e}")
        active_skills = []

    if active_skills:
        system_prompt += (
            "\n\n## PANDUAN KEAHLIAN / SKILL KHUSUS (STANDAR OPERASIONAL PROSEDUR)\n"
            "Berikut adalah panduan keahlian dan SOP teknis modul spesialisasi yang telah didefinisikan organisasi.\n"
            "HIRARKI PRIORITAS ATURAN:\n"
            "1. **SKILL (SOP Teknis Modul)**: Memiliki prioritas TERTINGGI untuk urusan teknis SAP, standar coding/penamaan, referensi tabel/T-code, dan alur investigasi modul.\n"
            "2. **PERSONA ORGANISASI**: Mengatur identitas dasar peran asisten (misal SAP Leader), kepatuhan data, dan tone perusahaan.\n"
            "3. **PREFERENSI PRIBADI PENGGUNA**: Mengatur penyesuaian gaya penyampaian user, tanpa boleh melanggar SOP Teknis Skill maupun Persona Organisasi.\n\n"
            "Bila permintaan atau topik pengguna berkaitan dengan salah satu skill di bawah ini, "
            "Anda WAJIB membaca, memprioritaskan, dan mematuhi panduan/aturan teknis di dalam skill tersebut terlebih dahulu:\n"
        )
        for sk in active_skills:
            system_prompt += (
                f"\n### [SKILL] {sk['name']}\n"
                f"**Deskripsi:** {sk['description']}\n"
                f"**Pedoman & SOP:**\n"
                f"{sk['content']}\n"
            )
        system_prompt += "\n----------------------------------------------------------------\n"

    # ------------------------------------------------------------------
    # BATAS AKHIR BAGIAN STABIL
    #
    # Semua di bawah ini berbeda antar pengguna atau antar permintaan, jadi
    # ditulis paling akhir agar tidak merusak awalan yang dapat di-cache.
    # ------------------------------------------------------------------
    panjang_stabil = len(system_prompt)

    now_real = datetime.now()
    konteks = [
        "\n\n## KONTEKS PERMINTAAN INI\n",
        f"- Role pengguna: {user_role}\n",
        f"- Tanggal sistem saat ini (real-world): {now_real.strftime('%d.%m.%Y')} (format SAP: {now_real.strftime('%Y%m%d')}). Gunakan tanggal riil ini bila membuat dokumen atau transaksi. HINDARI menggunakan tahun masa depan (seperti 2028) bila tool get_server_date membaca tanggal anomali dari tabel USR02 testing.\n",
        (
            "- Hak ubah program: DIIZINKAN. Anda boleh membantu membuat dan mengubah "
            "objek/program di SAP bila diminta.\n"
            if boleh_ubah else
            "- Hak ubah program: TIDAK DIIZINKAN untuk peran ini. Anda hanya boleh MEMBACA "
            "data dan program. Bila pengguna meminta perubahan objek SAP, jelaskan dengan "
            "sopan bahwa perannya tidak memiliki hak tersebut dan sarankan menghubungi tim "
            "ABAP — jangan mencoba menjalankan perubahan apa pun.\n"
        ),
        f"- Sumber data yang tersedia: {inventory_line}\n",
    ]
    if target_system == "sql":
        konteks.append(
            f"- Target Sistem Aktif yang Dipilih Pengguna: **SQL DATABASE**\n"
            f"- Server SQL Target Aktif: **{sql_server_name}**\n"
            f"- INSTRUKSI TEGAS: Pengguna secara tegas memilih target koneksi ke **SQL Database ({sql_server_name})**.\n"
            f"  Segala permintaan data, pengecekan tabel/skema/view/kolom, atau query WAJIB dijalankan ke server SQL {sql_server_name} menggunakan tool SQL (`sql__*`).\n"
            f"  DILARANG berasumsi ke sistem SAP, DILARANG memanggil tool SAP, dan DILARANG menyebut 'Data langsung dari sistem SAP'!\n"
        )
    elif has_sap:
        konteks.append(
            f"- Target Sistem Aktif yang Dipilih Pengguna: **SAP ERP**\n"
            f"- Sistem SAP aktif: **{sap_server_name}** (SID: {sap_sid}). "
            f"Inilah NAMA_SERVER yang dipakai pada baris status di aturan FORMAT JAWABAN.\n"
        )
    else:
        konteks.append(
            "- CATATAN: Koneksi ke server MCP SAP sedang TERPUTUS. Beritahu pengguna bila "
            "mereka meminta data live SAP, namun tetap layani permintaan lain yang tidak "
            "membutuhkan SAP.\n"
        )
    if not has_rag:
        konteks.append("- CATATAN: Koneksi ke server RAG sedang TERPUTUS.\n")

    if personal_persona:
        konteks.append(
            f"\n--- PREFERENSI PRIBADI PENGGUNA INI (penyesuaian di atas persona organisasi) ---\n"
            f"{personal_persona}\n"
            f"------------------------------------------------------------------------------\n"
        )
        if global_persona:
            konteks.append(
                "CARA MENGGABUNGKAN: patuhi persona organisasi sebagai dasar, lalu terapkan "
                "preferensi pribadi pengguna di atasnya. Bila keduanya bertentangan pada hal "
                "yang sama (misal gaya bahasa atau panjang jawaban), preferensi pribadi yang "
                "menang — KECUALI menyangkut aturan keakuratan data, keamanan, atau kepatuhan, "
                "yang selalu mengikuti persona organisasi.\n"
            )
        else:
            konteks.append("Patuhi preferensi di atas secara konsisten pada setiap balasan.\n")

    system_prompt += "".join(konteks)

    logger.info(
        f"Prompt: {panjang_stabil} karakter bagian stabil (dapat di-cache) + "
        f"{len(system_prompt) - panjang_stabil} karakter konteks per permintaan."
    )

    messages = [SystemMessage(content=system_prompt)]

    # Anggaran riwayat ditegakkan di sini agar berlaku untuk semua pemanggil,
    # bukan bergantung pada berapa banyak yang dikirim klien.
    trimmed_history, trim_stats = trim_history(
        chat_req.history,
        token_budget=settings.history_token_budget,
        verbatim_turns=settings.history_verbatim_turns,
    )
    if trim_stats["before"] != trim_stats["after"]:
        logger.info(
            f"Riwayat dipangkas: ~{trim_stats['before']} -> ~{trim_stats['after']} token "
            f"({trim_stats['dropped']} pesan dibuang, {trim_stats['compacted']} dipadatkan)."
        )

    for msg in trimmed_history:
        role = msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", None)
        content = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", None)
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role in ("assistant", "ai"):
            messages.append(AIMessage(content=content))
            
    # --- LAMPIRAN PENGGUNA ---
    # Dokumen disisipkan sebagai teks konteks; gambar dikirim sebagai bagian
    # multimodal. Bila model tidak mendukung gambar, permintaan diulang tanpa
    # gambar agar percakapan tetap berjalan (lihat _invoke_with_vision_fallback).
    attachment_images = []
    user_content = chat_req.message

    if getattr(chat_req, "attachment_ids", None):
        from database import load_uploads
        from uploads import build_context_blocks

        loaded = load_uploads(chat_req.attachment_ids[:5], username)
        if loaded:
            text_block, attachment_images = build_context_blocks(loaded)
            names = ", ".join(item["filename"] for item in loaded)
            logger.info(f"Menyertakan {len(loaded)} lampiran sebagai konteks: {names}")
            await report("reading", f"Membaca lampiran ({len(loaded)} berkas)…")

            if text_block:
                user_content = (
                    f"{chat_req.message}\n\n"
                    f"=== LAMPIRAN DARI PENGGUNA ===\n{text_block}\n"
                    f"=== AKHIR LAMPIRAN ===\n\n"
                    f"Gunakan isi lampiran di atas untuk menjawab. Bila jawaban berasal dari "
                    f"lampiran, sebutkan nama berkasnya."
                )
            if attachment_images:
                daftar = ", ".join(img["filename"] for img in attachment_images)
                user_content += f"\n\n(Pengguna melampirkan gambar: {daftar})"

    if attachment_images:
        parts = [{"type": "text", "text": user_content}]
        for image in attachment_images:
            parts.append({"type": "image_url", "image_url": {"url": image["data_url"]}})
        messages.append(HumanMessage(content=parts))
    else:
        messages.append(HumanMessage(content=user_content))

    # 5. Agentic Loop
    sources = []
    max_iterations = MAX_ITERATIONS
    iteration = 0
    
    while iteration < max_iterations:
        iteration += 1
        await report(
            "thinking",
            "Menganalisis pertanyaan…" if iteration == 1 else "Menyusun jawaban dari data…",
            iteration,
        )
        active_primary = llm_primary_auto
        active_fallback = llm_fallback_auto
        
        try:
            response = await call_model(active_primary, messages)
        except Exception as primary_err:
            vision_retry_ok = False
            # Model yang tidak mendukung gambar menolak seluruh permintaan.
            # Ulangi tanpa gambar agar pertanyaannya tetap terjawab.
            if attachment_images and _looks_like_vision_error(primary_err):
                logger.warning(
                    f"Model menolak lampiran gambar ({primary_err}); mengulang tanpa gambar."
                )
                messages = _strip_images(messages)
                attachment_images = []
                try:
                    response = await call_model(active_primary, messages)
                except Exception as retry_err:
                    primary_err = retry_err
                else:
                    # Berhasil tanpa gambar; lanjutkan ke pemrosesan
                    # respons seperti biasa, jangan panggil model lagi.
                    vision_retry_ok = True
            if not vision_retry_ok:
                logger.warning(f"Model utama ({primary_model_name}) gagal: {primary_err}. Menjajal model fallback ({fallback_model_name})...")
                try:
                    response = await call_model(active_fallback, messages)
                except Exception as fallback_err:
                    logger.warning(f"Model fallback dengan tool binding gagal: {fallback_err}. Menjajal fallback plain prompt tanpa tools...")
                    try:
                        # Retry terakhir dengan model fallback tanpa tool binding (mengatasi model gratis yg tdk support function calling)
                        response = await call_model(llm_fallback, messages)
                    except Exception as e:
                        err = str(e)
                        logger.error(f"LLM primary and fallback invoke error: {err}")
                        low = err.lower()
                        if "429" in err or "rate limit" in low or "resource_exhausted" in low:
                            reply_text = (
                                "⚠️ **Batas Kuota / Rate Limit Terlampaui (429)**\n\n"
                                "Model AI gratis OpenRouter sedang mengalami pembatasan rate limit (terlalu banyak permintaan per menit).\n\n"
                                "**Solusi:**\n"
                                "1. Tunggu 20-30 detik lalu ulangi pertanyaan Anda.\n"
                                "2. Atau ganti **Primary / Fallback AI Model** di menu **Admin Dashboard > Settings** ke model lain (misal: `openrouter/auto`, `google/gemini-2.0-flash-exp:free`, `meta-llama/llama-3.3-70b-instruct:free`, dll.) atau gunakan API Key berbayar untuk kapasitas tanpa batas.\n\n"
                                f"_Detail error provider:_ `{err[:250]}`"
                            )
                        elif "402" in err or "credit" in low or "insufficient" in low or "quota" in low:
                            reply_text = (
                                "⚠️ **Layanan AI tidak tersedia (402)**\n\n"
                                "Panggilan ke model AI utama maupun fallback gagal karena **saldo/kuota OpenRouter habis** (error 402). "
                                "Silakan periksa saldo kredit akun OpenRouter atau perbarui pilihan model pada Admin Dashboard.\n\n"
                                "_Catatan: koneksi RAG & MCP SAP sendiri berfungsi normal._"
                            )
                        else:
                            reply_text = (
                                "⚠️ **Kesalahan Layanan AI**\n\n"
                                f"Gagal memanggil model AI (Utama & Fallback): {err[:300]}"
                            )
                        return ChatResponse(reply=reply_text, sources=sources)
        messages.append(response)
        
        if not response.tool_calls:
            raw_content = _extract_text(response.content)
            
            # Cek apakah LLM mencoba menulis panggilan tool dalam teks alih-alih function call native
            # Pola seperti: sap__read_table({"table": "AUFK"}) atau rag__rag_search({"query": "..."})
            text_tool_match = re.search(r'(?:call:\s*)?(sap__[a-zA-Z0-9_]+|rag__[a-zA-Z0-9_]+|email__[a-zA-Z0-9_]+)\s*\(\s*({.*?})\s*\)', raw_content, flags=re.DOTALL)
            if text_tool_match and iteration < max_iterations:
                t_name = text_tool_match.group(1)
                t_args_str = text_tool_match.group(2)
                try:
                    import json
                    t_args = json.loads(t_args_str)
                    logger.info(f"Fallback Text Parser mendeteksi tool call: {t_name} dengan argumen {t_args}")
                    
                    server_name, actual_tool_name = t_name.split("__", 1)
                    # Yang mengalir tadi adalah panggilan tool berbentuk teks,
                    # bukan jawaban untuk pengguna.
                    await reset_stream()
                    await report("tool", _describe_tool(server_name, actual_tool_name, t_args), iteration)
                    tool_result = await mcp_manager.call_tool(
                        server_name, actual_tool_name, t_args, sap_target=sap_target
                    )
                    
                    res_str = ""
                    if tool_result.content:
                        res_str = "\n".join([item.text for item in tool_result.content if item.text])
                    if tool_result.is_error:
                        res_str = f"Execution Error: {res_str or tool_result.content}"
                        
                    sources.append(SourceReference(
                        type=server_name.upper() if server_name in ("sap", "sql", "email", "rag") else "MCP",
                        name=f"Tool: {actual_tool_name}",
                        content=res_str[:500] if len(res_str) > 500 else res_str
                    ))
                    
                    messages.append(HumanMessage(
                        content=f"Hasil eksekusi {t_name}: {res_str}\n\nLanjutkan dengan menjawab pertanyaan pengguna dalam Bahasa Indonesia atau panggil tool berikutnya jika perlu."
                    ))
                    continue
                except Exception as parse_ex:
                    logger.warning(f"Gagal mem-parse text-based tool call: {parse_ex}")

            # Model kadang membocorkan penalaran alih-alih menjawab. Dorong sekali
            # untuk menulis jawaban akhir — tanpa memaksa pemanggilan tool SAP,
            # karena permintaan yang sedang diproses belum tentu soal data SAP.
            leaked = response.content.lower() if isinstance(response.content, str) else ""
            if iteration == 1 and any(
                marker in leaked
                for marker in ("thinking process", "identify available tools", "we need to answer")
            ):
                logger.info("Model membocorkan proses berpikir alih-alih menjawab. Meminta jawaban akhir...")
                await reset_stream()
                messages.append(HumanMessage(
                    content=(
                        "SISTEM: Jangan tampilkan analisis internal berbahasa Inggris. Tuliskan jawaban "
                        "akhir untuk pengguna dalam Bahasa Indonesia. Bila permintaan membutuhkan data "
                        "live SAP, panggil tool SAP yang sesuai terlebih dahulu; bila tidak, jawab langsung."
                    )
                ))
                continue

            reply_text = raw_content
            if reply_text.strip():
                break
            if iteration < max_iterations:
                await reset_stream()
                messages.append(HumanMessage(
                    content="Tolong tuliskan jawaban akhir dalam teks biasa (bahasa Indonesia) berdasarkan informasi yang sudah tersedia di atas."
                ))
                continue
            reply_text = "Maaf, saya belum bisa merumuskan jawaban. Silakan ulangi atau perjelas pertanyaan Anda."
            break
            
        # Model kadang menuliskan sedikit teks sebelum memanggil tool; teks itu
        # bukan jawaban akhir sehingga tidak boleh tertinggal di layar.
        await reset_stream()
        pemakaian["tool_calls"] += len(response.tool_calls)

        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_id = tool_call["id"]
            
            logger.info(f"Agent memanggil tool: {tool_name} dengan argumen {tool_args}")
            
            if tool_name not in tool_map:
                error_msg = f"Error: Tool {tool_name} tidak ditemukan."
                messages.append(ToolMessage(content=error_msg, tool_call_id=tool_id))
                continue
                
            mapping = tool_map[tool_name]
            server_name = mapping["server"]
            mcp_name = mapping["mcp_name"]
            
            try:
                await report("tool", _describe_tool(server_name, mcp_name, tool_args), iteration)
                result = await mcp_manager.call_tool(
                    server_name, mcp_name, tool_args, sap_target=sap_target
                )
                texts = []
                if result.content:
                    for c in result.content:
                        if hasattr(c, "text"):
                            texts.append(c.text)
                        else:
                            texts.append(str(c))
                if result.is_error and not texts:
                    texts.append(f"Execution Error: {result}")
                            
                content_str = "\n".join(texts)
                messages.append(ToolMessage(content=content_str, tool_call_id=tool_id))
                
                source_type = server_name.upper() if server_name in ("sap", "sql", "email", "rag") else "MCP"
                sources.append(SourceReference(
                    type=source_type,
                    name=f"Tool: {mcp_name}",
                    content=content_str[:500] + ("..." if len(content_str) > 500 else "")
                ))
            except Exception as e:
                logger.error(f"Error mengeksekusi tool {tool_name}: {e}")
                messages.append(ToolMessage(content=f"System Error: {str(e)}", tool_call_id=tool_id))
    else:
        try:
            await reset_stream()
            summary_messages = messages + [
                HumanMessage(content="Berdasarkan seluruh hasil panggilan tool di atas, rangkum dan berikan jawaban akhir yang jelas dan lengkap dalam bahasa Indonesia diawali header box server.")
            ]
            try:
                final_res = await call_model(llm_primary, summary_messages)
            except Exception:
                final_res = await call_model(llm_fallback, summary_messages)
            reply_text = _extract_text(final_res.content)
            if not reply_text.strip():
                reply_text = "Maaf, data dari tool sudah terkumpul tetapi rangkuman jawaban tidak dapat diproses."
        except Exception as e:
            reply_text = "Proses pencarian selesai. Berikut sebagian informasi dari tool: " + (response.content or "")

    if "```sap-artifact" in (reply_text or ""):
        await report("building", "Menyiapkan berkas hasil…", max_iterations)

    # Ubah blok spesifikasi berkas dari model menjadi berkas Excel/CSV sungguhan.
    reply_text, artifacts = extract_and_build(reply_text, owner=username)
    await report("done", "Selesai", max_iterations)

    statistik = UsageStats(
        prompt_tokens=pemakaian["prompt"] if pemakaian["ada"] else None,
        completion_tokens=pemakaian["completion"] if pemakaian["ada"] else None,
        total_tokens=(pemakaian["prompt"] + pemakaian["completion"]) if pemakaian["ada"] else None,
        cached_tokens=pemakaian["cached"] if pemakaian["ada"] else None,
        latency_ms=int((time.perf_counter_ns() - mulai_ns) / 1_000_000),
        model=primary_model_name,
        tool_calls=pemakaian["tool_calls"],
    )

    return ChatResponse(
        reply=reply_text, sources=sources, artifacts=artifacts, usage=statistik
    )


DEFAULT_SUGGESTIONS = {
    "id": {
        "abaper": [
            {
                "title": "Kode ABAP & BAPI",
                "subtitle": "Best practice pemanggilan function & tabel",
                "query": "Tunjukkan pola kode ABAP yang direkomendasikan untuk membaca MARC/MARD menggunakan BAPI atau SQL efisien.",
                "icon": "Code"
            },
            {
                "title": "Analisis Dump ST22",
                "subtitle": "Panduan investigasi runtime error ABAP",
                "query": "Bagaimana cara menganalisis short dump runtime error ST22 dan langkah isolasi bug-nya?",
                "icon": "FileSpreadsheet"
            },
            {
                "title": "Optimasi Query SAP",
                "subtitle": "Teknik indexing & FOR ALL ENTRIES",
                "query": "Jelaskan best practice optimasi query Open SQL SAP dengan FOR ALL ENTRIES dan index table.",
                "icon": "Database"
            },
            {
                "title": "Troubleshooting IDoc & RFC",
                "subtitle": "Investigasi status WE02 dan koneksi SM59",
                "query": "Bagaimana cara melacak IDoc error di transaksi WE02 dan menguji koneksi RFC via SM59?",
                "icon": "Zap"
            },
            {
                "title": "Desain CDS View",
                "subtitle": "Pembuatan Core Data Services di SAP HANA",
                "query": "Beri contoh pembuatan CDS View ABAP dengan anotasi analitik dan asosiasi tabel.",
                "icon": "Layers"
            },
            {
                "title": "Analisis Lock SM12",
                "subtitle": "Cek entri penguncian objek yang tertahan",
                "query": "Bagaimana prosedur aman memeriksa dan menangani lock entries yang menggantung di transaksi SM12?",
                "icon": "Shield"
            }
        ],
        "functional": [
            {
                "title": "Cek Ketersediaan Stok",
                "subtitle": "Lihat stok barang di plant saat ini",
                "query": "Berapa ketersediaan stok material di plant kita saat ini?",
                "icon": "Layers"
            },
            {
                "title": "Status Purchase Order",
                "subtitle": "Pantau PO terbuka dan jadwal pengiriman",
                "query": "Tampilkan Purchase Order (PO) terbuka terbaru dan status penerimaan barangnya.",
                "icon": "Search"
            },
            {
                "title": "Production Order & PP",
                "subtitle": "Analisis alur rilis order dan reservasi",
                "query": "Jelaskan alur rilis Production Order dan pengecekan reservasi komponen RESB.",
                "icon": "Package"
            },
            {
                "title": "Analisis Delivery SD",
                "subtitle": "Pantau outbound delivery dan picking status",
                "query": "Bagaimana cara memeriksa status pengiriman outbound delivery di VL06O dan kendala picking?",
                "icon": "TrendingUp"
            },
            {
                "title": "Rekonsiliasi Faktur & GR",
                "subtitle": "Pemeriksaan selisih akun GR/IR (MIRO)",
                "query": "Tunjukkan langkah analisis selisih nilai akun kliring GR/IR pada verifikasi faktur MIRO.",
                "icon": "FileSpreadsheet"
            },
            {
                "title": "Evaluasi Kebutuhan MRP",
                "subtitle": "Simulasi stok MD04 dan proposal order",
                "query": "Jelaskan cara mengevaluasi hasil kalkulasi kebutuhan material di Stock/Requirements List MD04.",
                "icon": "Database"
            }
        ],
        "superadmin": [
            {
                "title": "Status & Health SAP",
                "subtitle": "Koneksi RFC & pemeriksaan MCP Server",
                "query": "Periksa status koneksi SAP RFC dan kesehatan server MCP aktif.",
                "icon": "Shield"
            },
            {
                "title": "Audit Pemakaian Token",
                "subtitle": "Pantau kuota token dan aktivitas user",
                "query": "Tampilkan ringkasan audit penggunaan token hari ini dan pengguna paling aktif.",
                "icon": "TrendingUp"
            },
            {
                "title": "Optimasi Mode & Model AI",
                "subtitle": "Rekomendasi konfigurasi model sistem",
                "query": "Bagaimana rekomendasi pengaturan provider model AI dan mode chat terbaik untuk beban kerja saat ini?",
                "icon": "Zap"
            },
            {
                "title": "Monitoring Job SM37",
                "subtitle": "Lacak batch job yang gagal atau delayed",
                "query": "Tampilkan daftar background job yang berstatus canceled atau berjalan abnormal di SM37 hari ini.",
                "icon": "Zap"
            },
            {
                "title": "Audit Otorisasi Kritis",
                "subtitle": "Tinjau akses SAP_ALL dan role istimewa",
                "query": "Bagaimana cara melakukan audit user aktif yang memiliki hak akses SAP_ALL atau profil kritis di SUIM?",
                "icon": "Shield"
            },
            {
                "title": "Kesehatan Database BA130",
                "subtitle": "Periksa performa tabel dan ruang storage",
                "query": "Periksa status kesehatan database, kueri berat, dan ketersediaan tabel pada instance BA130.",
                "icon": "Database"
            }
        ],
        "default": [
            {
                "title": "Cek Ketersediaan Stok",
                "subtitle": "Lihat stok barang di plant saat ini",
                "query": "Berapa ketersediaan stok material di plant kita saat ini?",
                "icon": "Layers"
            },
            {
                "title": "Status Purchase Order",
                "subtitle": "Pantau PO terbuka dan jadwal pengiriman",
                "query": "Tampilkan Purchase Order (PO) terbuka terbaru dan status penerimaan barangnya.",
                "icon": "Search"
            },
            {
                "title": "Kode ABAP & BAPI",
                "subtitle": "Best practice pemanggilan function & tabel",
                "query": "Tunjukkan pola kode ABAP yang direkomendasikan untuk membaca MARC/MARD menggunakan BAPI atau SQL efisien.",
                "icon": "FileSpreadsheet"
            },
            {
                "title": "Monitoring Transaksi SAP",
                "subtitle": "Panduan transaksi penting per modul",
                "query": "Tampilkan daftar t-code SAP paling sering digunakan untuk modul MM, SD, dan PP.",
                "icon": "Zap"
            },
            {
                "title": "Konektivitas Sistem SAP",
                "subtitle": "Cek status server dan respon layanan",
                "query": "Bagaimana kondisi koneksi sistem SAP dan waktu respons server saat ini?",
                "icon": "Shield"
            },
            {
                "title": "Ringkasan Integrasi ERP",
                "subtitle": "Alur integrasi logistik dan keuangan",
                "query": "Jelaskan gambaran umum alur dokumen dari Order hingga Pembayaran (Order-to-Cash) di SAP.",
                "icon": "TrendingUp"
            }
        ]
    },
    "en": {
        "abaper": [
            {
                "title": "ABAP Code & BAPI",
                "subtitle": "Best practices for function modules & tables",
                "query": "Show me the recommended ABAP pattern for reading MARC/MARD using BAPI or clean SQL.",
                "icon": "Code"
            },
            {
                "title": "Analyze ST22 Short Dump",
                "subtitle": "Investigation guide for ABAP runtime errors",
                "query": "How do I systematically troubleshoot an ST22 runtime error short dump in SAP?",
                "icon": "FileSpreadsheet"
            },
            {
                "title": "SAP SQL Optimization",
                "subtitle": "Indexing & FOR ALL ENTRIES best practices",
                "query": "Explain best practices for optimizing Open SQL queries with FOR ALL ENTRIES and primary keys.",
                "icon": "Database"
            },
            {
                "title": "IDoc & RFC Diagnostics",
                "subtitle": "Inspect WE02 errors & SM59 connection test",
                "query": "What are the troubleshooting steps for stuck outbound IDocs in WE02 and testing RFC destinations in SM59?",
                "icon": "Zap"
            },
            {
                "title": "CDS View Modeling",
                "subtitle": "Building clean Core Data Services views",
                "query": "Provide a clean example of an ABAP CDS View with analytical annotations and table associations.",
                "icon": "Layers"
            },
            {
                "title": "SM12 Enqueue Lock Audit",
                "subtitle": "Safely inspect lingering table locks",
                "query": "How do I safely analyze and manage lingering enqueue locks in transaction SM12?",
                "icon": "Shield"
            }
        ],
        "functional": [
            {
                "title": "Check Stock Availability",
                "subtitle": "View current stock levels in our plants",
                "query": "What is the current stock availability in our plant?",
                "icon": "Layers"
            },
            {
                "title": "Purchase Order Status",
                "subtitle": "Track open POs and pending delivery items",
                "query": "Show recent open Purchase Orders (PO) and their delivery status.",
                "icon": "Search"
            },
            {
                "title": "Production Orders & PP",
                "subtitle": "Analyze order release and reservations",
                "query": "Explain the Production Order release flow and RESB component reservations check.",
                "icon": "Package"
            },
            {
                "title": "Outbound Delivery Flow",
                "subtitle": "Monitor shipping & picking status in VL06O",
                "query": "How do I check open outbound deliveries and resolve picking bottlenecks in VL06O?",
                "icon": "TrendingUp"
            },
            {
                "title": "GR/IR Account Clearance",
                "subtitle": "Identify invoice price variances in MIRO",
                "query": "What are the recommended steps to clear price variances in GR/IR clearing accounts during invoice verification?",
                "icon": "FileSpreadsheet"
            },
            {
                "title": "MRP Run Evaluation",
                "subtitle": "Simulate stock demands in MD04 list",
                "query": "How do I interpret MRP stock/requirements exceptions in MD04 for delayed replenishment?",
                "icon": "Database"
            }
        ],
        "superadmin": [
            {
                "title": "SAP Health & Connectivity",
                "subtitle": "Inspect RFC connections & MCP servers",
                "query": "Check SAP RFC connection status and active MCP server health.",
                "icon": "Shield"
            },
            {
                "title": "Token Usage Audit",
                "subtitle": "Monitor daily token quotas & user stats",
                "query": "Show token usage audit summary for today and list of most active users.",
                "icon": "TrendingUp"
            },
            {
                "title": "AI Modes & Provider Tuning",
                "subtitle": "Recommended model routing configurations",
                "query": "What are the recommended settings for AI model providers and chat modes for our workload?",
                "icon": "Zap"
            },
            {
                "title": "SM37 Batch Job Monitor",
                "subtitle": "Track failed and aborted background jobs",
                "query": "List all background jobs in SM37 that aborted or experienced long execution delays today.",
                "icon": "Zap"
            },
            {
                "title": "Privileged Role Audit",
                "subtitle": "Review users with SAP_ALL in SUIM",
                "query": "Show guidelines to audit active dialog users holding SAP_ALL authorizations in production.",
                "icon": "Shield"
            },
            {
                "title": "Database Instance BA130",
                "subtitle": "Inspect table growth and slow queries",
                "query": "Check database health, long-running queries, and storage status for BA130 instance.",
                "icon": "Database"
            }
        ],
        "default": [
            {
                "title": "Check Stock Availability",
                "subtitle": "View current stock levels in our plants",
                "query": "What is the current stock availability in our plant?",
                "icon": "Layers"
            },
            {
                "title": "Purchase Order Status",
                "subtitle": "Track open POs and pending delivery items",
                "query": "Show recent open Purchase Orders (PO) and their delivery status.",
                "icon": "Search"
            },
            {
                "title": "ABAP Code & BAPI",
                "subtitle": "Best practices for function modules & tables",
                "query": "Show me the recommended ABAP pattern for reading MARC/MARD using BAPI or clean SQL.",
                "icon": "FileSpreadsheet"
            },
            {
                "title": "Essential SAP T-Codes",
                "subtitle": "Quick guide for common transactions",
                "query": "Provide a cheat-sheet of essential SAP transaction codes across MM, SD, and FI modules.",
                "icon": "Zap"
            },
            {
                "title": "System Connectivity Status",
                "subtitle": "Check server response times and health",
                "query": "What is the current health and response time of our connected SAP environments?",
                "icon": "Shield"
            },
            {
                "title": "Procure-to-Pay Overview",
                "subtitle": "End-to-end document lifecycle flow",
                "query": "Explain the end-to-end Procure-to-Pay cycle and key document statuses in SAP.",
                "icon": "TrendingUp"
            }
        ]
    }
}

FOCUS_THEMES = {
    "id": [
        "Investigasi Kendala, Error Troubleshooting & Isolasi Bug",
        "Optimasi Kinerja, Efisiensi Query & Best Practice Arsitektur",
        "Monitoring Operasional, Kesehatan Server & Cek Konektivitas",
        "Otomasi Alur Bisnis, Status Dokumen Terbuka & Rekonsiliasi",
        "Integritas Data, Audit Jejak Rekam & Keamanan Otorisasi",
        "Pemeriksaan Database, Analisis Struktur Tabel & Eksekusi Rutin",
    ],
    "en": [
        "Troubleshooting, Error Diagnostics & Bug Isolation",
        "Performance Optimization, Query Efficiency & Architecture Best Practices",
        "Operational Monitoring, System Health, Logs & Connectivity",
        "Business Workflow Automation, Open Status Tracking & Reconciliation",
        "Data Integrity, Audit Trails & Authorization Security Checks",
        "Database Inspection, Table Consistency & Deep Execution Routines",
    ],
}


async def generate_chat_suggestions(
    role: str = "guest",
    persona: str = "",
    recent_queries: list[str] | None = None,
    lang: str = "id",
    refresh: bool = False,
) -> list[dict]:
    """Hasilkan saran pertanyaan dinamis menggunakan LLM berdasarkan role & riwayat chat user."""
    import random
    lang_key = "en" if str(lang).lower().startswith("en") else "id"
    role_key = (role or "").lower()
    pool = (
        DEFAULT_SUGGESTIONS.get(lang_key, {}).get(role_key)
        or DEFAULT_SUGGESTIONS.get(lang_key, {}).get("default")
        or DEFAULT_SUGGESTIONS["id"]["default"]
    )
    if pool and len(pool) >= 3:
        first = pool[0]
        rest = pool[1:]
        fallback_list = [first] + random.sample(rest, 2)
    else:
        fallback_list = pool

    try:
        from database import get_system_config
        sys_cfg = get_system_config()
        provider = "nine_router" if sys_cfg.get("nine_router_enabled", True) else "openrouter"
        model_name = sys_cfg.get("nine_router_model") or "ag/gemini-3.7-flash-medium"
        llm = _buat_llm(provider, model_name, sys_cfg, max_tokens=350, temperature=0.85)

        if not llm:
            return fallback_list

        queries_context = ""
        if recent_queries:
            sampled_queries = list(recent_queries[:6])
            if refresh:
                random.shuffle(sampled_queries)
            queries_context = "\n- " + "\n- ".join(sampled_queries)
        else:
            queries_context = "(Belum ada riwayat pertanyaan / pengguna baru)"

        language_instruction = "Indonesian (Bahasa Indonesia)" if lang_key == "id" else "English"
        themes_list = FOCUS_THEMES.get(lang_key, FOCUS_THEMES["id"])
        selected_theme = random.choice(themes_list)
        random_seed = random.randint(1000, 999999)

        prompt = f"""You are an expert Enterprise SAP ERP AI Assistant generating diverse chat starter prompt cards.
Generate exactly 3 DISTINCT, ACTIONABLE, and HIGHLY RELEVANT chat prompt starter cards for this user:
- User Role: {role} (e.g. abaper = ABAP developer; functional = SAP functional consultant; superadmin = SAP Basis & System Admin; guest/user = Standard user)
- User Preferences / Persona: {persona or 'Standard user'}
- Recent Topics / Inquiries Asked By User:
{queries_context}

CREATIVE FOCUS ANGLE FOR THIS SET (Variasi Segar):
- Special Focus Theme: "{selected_theme}"
- Variation Entropy Seed: #{random_seed}

CRITICAL RULES FOR MAXIMUM VARIETY & APPLICABILITY:
1. Ground every question firmly in SAP ERP enterprise operations and the user's role and topics.
2. DO NOT repeat earlier suggestions word-for-word. Each refresh must reveal new dimensions of their workflow!
3. Dedicate this set to explore the theme: "{selected_theme}".
4. Make all 3 cards distinct in intent:
   - Card 1: Diagnostic / Status / Health check (e.g. tracking, logs, active state).
   - Card 2: Deep-dive / Root cause / Investigation inquiry (e.g. troubleshooting, analyzing exceptions).
   - Card 3: Optimization / Best practice / Automation action (e.g. performance tuning, automation, security audit).

Format: Return a JSON list of 3 items. Each item MUST have:
1. "title": Short punchy action title (2 to 4 words)
2. "subtitle": Short description / context (5 to 10 words)
3. "query": The exact, natural user prompt that will be sent into chat when clicked
4. "icon": One of ["Layers", "Search", "FileSpreadsheet", "Database", "Code", "Package", "TrendingUp", "Zap", "Shield"]

Language of title, subtitle, and query: {language_instruction}.
Return ONLY valid JSON array with no markdown formatting around it."""

        res = await asyncio.wait_for(
            llm.ainvoke([HumanMessage(content=prompt)]),
            timeout=15.0
        )
        content = _extract_text(res.content).strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
        data = json.loads(content)
        if isinstance(data, list) and len(data) >= 3:
            cleaned = []
            for item in data[:3]:
                if isinstance(item, dict) and item.get("title") and item.get("query"):
                    cleaned.append({
                        "title": str(item["title"]).strip(),
                        "subtitle": str(item.get("subtitle", "")).strip(),
                        "query": str(item["query"]).strip(),
                        "icon": str(item.get("icon") or "Layers").strip()
                    })
            if len(cleaned) == 3:
                return cleaned
    except Exception as e:
        logger.warning(f"Gagal generate dynamic suggestions via LLM, menggunakan fallback: {e}")

    return fallback_list