import json
import logging
import re
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage, AIMessage
from mcp_manager import mcp_manager
from artifacts import ARTIFACT_PROMPT, extract_and_build
from conversation import trim_history
from models import ChatRequest, ChatResponse, SourceReference
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

def _describe_tool(server: str, tool_name: str, args: dict = None) -> str:
    """Terjemahkan pemanggilan tool menjadi keterangan yang dipahami pengguna."""
    name = (tool_name or "").lower()
    if server == "rag":
        return "Mencari di dokumen internal…"
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


async def _noop_progress(**kwargs):
    """Penerima progres bawaan untuk pemanggil yang tidak memerlukannya."""


async def process_chat(chat_req: ChatRequest, user_role: str = "user", user_persona: str = "",
                       username: str = "Guest", on_progress=None, on_token=None) -> ChatResponse:
    # Progres dilaporkan sebagai tahapan nyata (bukan perkiraan waktu): langkah
    # keberapa dari batas iterasi agen, beserta keterangan yang sedang dikerjakan.
    progress = on_progress or _noop_progress
    MAX_ITERATIONS = 6

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
            return await model.ainvoke(msgs)

        merged = None
        terkumpul = ""
        terkirim = ""
        try:
            async for chunk in model.astream(msgs):
                merged = chunk if merged is None else merged + chunk
                potongan = _chunk_text(chunk.content)
                if not potongan:
                    continue
                terkumpul += potongan

                # Jalur cepat: selama tidak ada penanda yang perlu dibersihkan,
                # potongan diteruskan apa adanya. Tanpa ini setiap potongan akan
                # memicu regex atas seluruh teks — biaya kuadratik pada jawaban
                # panjang.
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
            return await model.ainvoke(msgs)
        return merged

    await report("connecting", "Menyiapkan permintaan…")

    # 1. Ambil tools dari MCP (berdasarkan server yang dipilih)
    target_srv = chat_req.active_server or chat_req.server or chat_req.selected_server or "sap"
    # Target SAP dibawa per-request dan diterapkan ulang di setiap pemanggilan
    # tool (lihat mcp_manager.call_tool). Menetapkannya sekali di awal tidak
    # aman: user lain dapat menggesernya sebelum tool ini benar-benar dijalankan.
    sap_target = target_srv.split(":", 1)[1] if target_srv.startswith("sap:") else None
    if sap_target:
        logger.info(f"Target SAP server untuk request ini: {sap_target}")

    all_mcp_tools = await mcp_manager.get_all_tools(server_filter=target_srv)
    
    if not all_mcp_tools:
        return ChatResponse(
            reply=(
                "⚠️ **Koneksi ke sistem SAP terputus**\n\n"
                "Saya belum bisa mengambil data dari sistem SAP maupun basis dokumen internal "
                "saat ini. Silakan coba beberapa saat lagi, atau hubungi administrator bila "
                "berlanjut.\n\n"
                "Anda tetap bisa bertanya hal umum atau melampirkan berkas untuk saya bantu olah."
            ),
            sources=[]
        )
        
    has_sap = any(item["server"] == "sap" for item in all_mcp_tools)
    has_rag = any(item["server"] == "rag" for item in all_mcp_tools)
    has_email = any(item["server"] == "email" for item in all_mcp_tools)
    
    # 2. Konversi tools MCP ke format OpenAI tools
    openai_tools = []
    tool_map = {} # map dari openai_tool_name ke (server_name, mcp_tool_name)
    
    for item in all_mcp_tools:
        server = item["server"]
        t = item["tool"]
        tool_name = f"{server}__{t.name}".replace("-", "_")
        
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

    # 3. Setup LLM (Dual Provider: 9Router Proxy & OpenRouter)
    from database import get_system_config
    sys_cfg = get_system_config()

    nine_router_enabled = sys_cfg.get("nine_router_enabled", True)
    nine_router_base_url = sys_cfg.get("nine_router_base_url") or settings.nine_router_base_url or "http://192.168.88.83:20128/v1"
    nine_router_model = sys_cfg.get("nine_router_model") or settings.nine_router_model or "ag/gemini-3.7-flash-medium"
    nine_router_api_key = sys_cfg.get("nine_router_api_key") or settings.nine_router_api_key or "sk-9router-local"

    openrouter_enabled = sys_cfg.get("openrouter_enabled", False)
    openrouter_api_key = sys_cfg.get("openrouter_api_key") or settings.openrouter_api_key
    openrouter_model = sys_cfg.get("openrouter_model") or settings.openrouter_model or "openrouter/auto"
    openrouter_fallback_model = sys_cfg.get("openrouter_fallback_model") or settings.openrouter_fallback_model or "openrouter/free"

    # Prioritas provider LLM
    if nine_router_enabled:
        llm_primary = ChatOpenAI(
            model=nine_router_model,
            openai_api_key=nine_router_api_key,
            openai_api_base=nine_router_base_url,
            max_retries=1,
            max_tokens=4096,
        )
        if openrouter_enabled and openrouter_api_key and openrouter_api_key != "your_openrouter_api_key_here":
            llm_fallback = ChatOpenAI(
                model=openrouter_fallback_model or openrouter_model,
                openai_api_key=openrouter_api_key,
                openai_api_base="https://openrouter.ai/api/v1",
                default_headers={
                    "HTTP-Referer": "https://github.com/bud1purwanto/SAP-AI-Assistant",
                    "X-Title": "SAP AI Assistant",
                },
                max_retries=1,
                max_tokens=4096,
            )
        else:
            llm_fallback = llm_primary
    elif openrouter_enabled or (openrouter_api_key and openrouter_api_key != "your_openrouter_api_key_here"):
        if not openrouter_api_key or openrouter_api_key == "your_openrouter_api_key_here":
            return ChatResponse(
                reply="Mohon maaf, 9Router dinonaktifkan dan API Key OpenRouter belum dikonfigurasi. Silakan atur konfigurasi AI Provider pada Dashboard Admin.",
                sources=[]
            )
        llm_primary = ChatOpenAI(
            model=openrouter_model,
            openai_api_key=openrouter_api_key,
            openai_api_base="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "https://github.com/bud1purwanto/SAP-AI-Assistant",
                "X-Title": "SAP AI Assistant",
            },
            max_retries=1,
            max_tokens=4096,
        )
        llm_fallback = ChatOpenAI(
            model=openrouter_fallback_model,
            openai_api_key=openrouter_api_key,
            openai_api_base="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "https://github.com/bud1purwanto/SAP-AI-Assistant",
                "X-Title": "SAP AI Assistant",
            },
            max_retries=1,
            max_tokens=4096,
        )
    else:
        return ChatResponse(
            reply="Mohon maaf, tidak ada AI Provider yang aktif. Silakan aktifkan 9Router atau OpenRouter melalui Dashboard Admin.",
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
    
    if target_srv.startswith("sap:"):
        sap_alias = target_srv.split(":", 1)[1].lower()
        if sap_alias in sub_servers_meta:
            sap_server_name, sap_sid = sub_servers_meta[sap_alias]
        else:
            sap_server_name = sap_alias.upper()

    # ------------------------------------------------------------------
    # SYSTEM PROMPT
    #
    # Prompt lama mewajibkan setiap balasan memanggil tool SAP dan diawali
    # header "📦 MM Server: ...". Akibatnya pertanyaan umum ("buatkan tabel
    # perbandingan", "ringkas ini", "jelaskan konsep") tetap dipaksa menjadi
    # laporan investigasi SAP. Prompt di bawah memisahkan dua hal: SAP tetap
    # keahlian utama dan tetap diprioritaskan untuk pertanyaan data, tetapi
    # asisten boleh menjawab langsung untuk hal di luar itu.
    # ------------------------------------------------------------------
    tool_inventory = []
    if has_sap:
        tool_inventory.append(f"data live SAP pada server **{sap_server_name} (SID: {sap_sid})**")
    if has_rag:
        tool_inventory.append("basis pengetahuan dokumen (RAG)")
    if has_email:
        tool_inventory.append("layanan MCP Email")
    inventory_line = " dan ".join(tool_inventory) if tool_inventory else "tidak ada sumber data eksternal"

    system_prompt = (
        f"Anda adalah SAP AI Assistant: asisten kerja serbaguna dengan keahlian utama SAP.\n"
        f"Role pengguna saat ini: {user_role}.\n"
        f"Sumber data yang tersedia untuk Anda: {inventory_line}.\n\n"

        f"## CARA MEMILIH PENDEKATAN\n"
        f"Tentukan dahulu jenis permintaan pengguna, lalu bertindak sesuai jenisnya:\n\n"
        f"**A. Permintaan data SAP nyata** (stock material, plant, PO/SO, vendor, isi tabel "
        f"MARA/MARC/MARD/T001W/EKKO/VBAK, kode ABAP, status dokumen, dsb.)\n"
        f"   -> WAJIB panggil tool MCP SAP untuk mengambil data LIVE. Jangan mengarang angka.\n"
        f"   -> Contoh: cek plant material 'SRRPAI' -> `sap__read_table` dengan `table: 'MARC'`, "
        f"`where: [\"MATNR = 'SRRPAI'\"]`, atau `sap__sap_read_table` dengan `table_name: 'MARC'`, "
        f"`options: [\"MATNR = 'SRRPAI'\"]`.\n"
        f"   -> Server SAP aktif SUDAH dipilih pengguna lewat antarmuka. Jangan bertanya ulang "
        f"soal pilihan server dan jangan menolak permintaan data.\n\n"
        f"**B. Pertanyaan konseptual, panduan, prosedur, atau isi dokumen internal**\n"
        f"   -> Gunakan `rag__search` bila jawabannya kemungkinan ada di dokumen internal "
        f"(blueprint, SOP, manual). Bila tidak ditemukan, jawab dari pengetahuan Anda dan "
        f"katakan bahwa itu bukan dari dokumen internal.\n\n"
        f"**C. Permintaan yang menyertakan lampiran** (pengguna mengirim gambar atau dokumen)\n"
        f"   -> Isi berkas sudah disediakan untuk Anda dalam blok LAMPIRAN DARI PENGGUNA. "
        f"Baca dan gunakan isinya; jangan meminta pengguna menempelkan ulang isinya.\n"
        f"   -> Sebutkan nama berkas ketika jawaban Anda bersumber dari lampiran tersebut.\n"
        f"   -> Bila lampiran bertentangan dengan data SAP, sampaikan perbedaannya, jangan "
        f"memilih diam-diam salah satunya.\n\n"
        f"**D. Permintaan umum di luar data SAP** — menulis, meringkas, menerjemahkan, "
        f"menghitung, menyusun tabel/laporan, membuat berkas Excel/CSV, menjelaskan konsep, "
        f"membantu kode, brainstorming, atau sekadar menyapa.\n"
        f"   -> JAWAB LANGSUNG dengan kemampuan Anda sendiri. JANGAN memanggil tool SAP/RAG "
        f"hanya karena tool tersedia, dan JANGAN mengubah jawaban menjadi laporan investigasi SAP.\n\n"
        f"Bila sebuah permintaan menggabungkan beberapa jenis (misalnya: ambil data SAP lalu "
        f"rapikan jadi Excel), kerjakan berurutan: ambil datanya dulu, baru olah hasilnya.\n\n"

        f"## MEMORI PERCAKAPAN\n"
        f"Anda memiliki akses ke riwayat percakapan sesi ini. Untuk pertanyaan lanjutan atau "
        f"rujukan ke data yang sudah dibahas, gunakan konteks tersebut dan jangan mengulang "
        f"pemanggilan tool bila datanya sudah ada. Jangan berhalusinasi atau mengabaikan "
        f"temuan sebelumnya.\n\n"

        f"## FORMAT JAWABAN\n"
        f"1. Gunakan Bahasa Indonesia yang jelas dan profesional, kecuali pengguna meminta bahasa lain.\n"
        f"2. Bila jawaban memuat data live dari SAP, awali dengan baris status berikut persis:\n"
        f"   📦 **Data langsung dari sistem {sap_server_name}**\n"
        f"   Tulis dalam bahasa kerja sehari-hari; hindari istilah internal seperti SID, MCP, RAG, "
        f"atau nama tool kepada pengguna. Untuk jawaban yang TIDAK mengambil data SAP, JANGAN "
        f"tampilkan baris tersebut.\n"
        f"3. Sajikan data tabular sebagai tabel markdown yang rapi. Gunakan bullet ringkas untuk penjelasan.\n"
        f"4. Tulis nama tabel/field/tcode secara inline (contoh: `VBAP` & `VBAK`, `MARA` & `MARC`), "
        f"bukan sebagai blok kode terpisah per baris.\n"
        f"5. Gunakan blok kode hanya untuk kode program utuh yang memang perlu disalin.\n"
        f"6. Sebutkan dengan jujur bila data tidak ditemukan; jangan mengarang isi tabel SAP.\n"
        f"7. DILARANG menampilkan penalaran internal berbahasa Inggris seperti 'We need to answer...', "
        f"'We performed a RAG search...', atau 'Doc 1 snippet:'.\n\n"

        f"{ARTIFACT_PROMPT}\n"
    )

    if not has_sap:
        system_prompt += (
            "\nCATATAN: Koneksi ke server MCP SAP sedang TERPUTUS. Beritahu pengguna bila mereka "
            "meminta data live SAP, namun tetap layani permintaan lain yang tidak membutuhkan SAP.\n"
        )
    if not has_rag:
        system_prompt += "\nCATATAN: Koneksi ke server RAG sedang TERPUTUS.\n"

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
    if personal_persona:
        system_prompt += (
            f"\n--- PREFERENSI PRIBADI PENGGUNA INI (penyesuaian di atas persona organisasi) ---\n"
            f"{personal_persona}\n"
            f"------------------------------------------------------------------------------\n"
        )
    if global_persona and personal_persona:
        system_prompt += (
            "CARA MENGGABUNGKAN: patuhi persona organisasi sebagai dasar, lalu terapkan preferensi "
            "pribadi pengguna di atasnya. Bila keduanya bertentangan pada hal yang sama (misal gaya "
            "bahasa atau panjang jawaban), preferensi pribadi yang menang — KECUALI menyangkut aturan "
            "keakuratan data, keamanan, atau kepatuhan, yang selalu mengikuti persona organisasi.\n"
        )
    elif global_persona or personal_persona:
        system_prompt += "Patuhi persona di atas secara konsisten pada setiap balasan.\n"

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

    primary_model_name = nine_router_model if nine_router_enabled else openrouter_model
    fallback_model_name = openrouter_fallback_model if openrouter_enabled else primary_model_name

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
                        type="MCP",
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
                
                sources.append(SourceReference(
                    type="MCP" if server_name == "sap" else "RAG",
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

    return ChatResponse(reply=reply_text, sources=sources, artifacts=artifacts)