import json
import logging
import re
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage, AIMessage
from mcp_manager import mcp_manager
from models import ChatRequest, ChatResponse, SourceReference
from config import settings

logger = logging.getLogger(__name__)

def _clean_thinking_process(text: str) -> str:
    """Membersihkan teks proses berpikir internal (<think>...</think>, 'Here's a thinking process:', 
    'Now server is set to...', 'User wants...', 'Let's use...', paragraf Bahasa Inggris analisis internal)
    yang dikeluarkan oleh model reasoning/instruct agar tidak bocor ke antarmuka pengguna."""
    if not text:
        return ""
    # 1. Hapus tag <think>...</think>
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    
    # 2. Hapus blok 'Here's a thinking process: ...'
    if "thinking process" in text.lower():
        parts = re.split(r'Here\'s? a thinking process:.*?(?=\n\n[📦🔍📊💰🛒🏭🔧🏬🧑‍💻A-Z]|\Z)', text, flags=re.DOTALL | re.IGNORECASE)
        cleaned = "".join([p for p in parts if p]).strip()
        if cleaned:
            text = cleaned
            
    # 3. Hapus teks penalaran / chain of thought seperti:
    # "Now server is set to...", "User wants...", "In SAP, TECO status...", "But the rule says...", "Let's use..."
    # sampai menemukan emoji header box (📦) atau awal respons resmi Bahasa Indonesia
    if "📦" in text:
        text = text[text.find("📦"):]
    elif "🔍" in text:
        text = text[text.find("🔍"):]
    else:
        # Jika tidak ada emoji header box, bersihkan pola kalimat penalaran umum di awal
        text = re.sub(r'^(Now server is set to|User wants|In SAP,|Need to find|Common tables:|But the rule says|We need to answer|We performed a|Let\'s examine|Doc \d+ snippet|We could try to|There is no|No plant|Analyzing user query).*?(?=\n\n[A-Z0-9\-\*]|\Z)', '', text, flags=re.DOTALL | re.IGNORECASE)
    
    # 4. Hapus sisa-sisa blok kode tool invocation palsu dalam teks markdown jika masih ada
    text = re.sub(r'```(?:abap|query|json)?\s*(?:sap__|rag__).*?```', '', text, flags=re.DOTALL | re.IGNORECASE)
    
    return text.strip()

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

async def process_chat(chat_req: ChatRequest, user_role: str = "user", user_persona: str = "") -> ChatResponse:
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
            reply="⚠️ **Sistem Terputus**\n\nMohon maaf, saya tidak dapat terhubung ke server MCP SAP maupun RAG SAP saat ini. Pastikan koneksi jaringan Anda stabil dan URL/Token di menu **Settings** sudah benar.",
            sources=[]
        )
        
    has_sap = any(item["server"] == "sap" for item in all_mcp_tools)
    has_rag = any(item["server"] == "rag" for item in all_mcp_tools)
    
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
            max_tokens=2048,
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
                max_tokens=1024,
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
            max_tokens=1024,
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
            max_tokens=1024,
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

    system_prompt = (
        f"Anda adalah Enterprise SAP Assistant (Leader Orchestrator).\n"
        f"Role pengguna saat ini: {user_role}.\n\n"
        f"🔴 ATURAN UTAMA SELEKSI SERVER:\n"
        f"Pengguna TELAH MEMILIH Server SAP aktif melalui antarmuka UI: **{sap_server_name} (SID: {sap_sid})**.\n"
        f"Server ini SUDAH DIAKTIFKAN secara otomatis di backend MCP.\n"
        f"JANGAN BERTANYA KEMBALI KEPADA PENGGUNA TENTANG PILIHAN SERVER MAUPUN MENOLAK QUERY DATA!\n"
        f"LANGSUNG eksekusi tool SAP (seperti `sap__read_table` atau `sap__sap_read_table`, `sap__read_program`, `sap__search_programs`, `sap__call_function`, dll) pada server ini.\n\n"
        f"🔴 PRIORITAS PENGGUNAAN TOOL & ATURAN QUERY DATA:\n"
        f"1. Pengecekan Data Live SAP (Material, Plant/Pabrik, Stock, Tabel MARA/MARC/MARD/T001W, PO, SO, Vendor, ABAP Code, dsb):\n"
        f"   -> WAJIB UTAMAKAN MEMANGGIL TOOL MCP SAP (seperti `sap__read_table` atau `sap__sap_read_table` dengan table MARC untuk Plant, MARA untuk Material Master) secara LIVE!\n"
        f"   -> Contoh untuk cek plant material 'SRRPAI': Panggil `sap__read_table` dengan `table: 'MARC'`, `where: [\"MATNR = 'SRRPAI'\"]` ATAU `sap__sap_read_table` dengan `table_name: 'MARC'`, `options: [\"MATNR = 'SRRPAI'\"]`.\n"
        f"   -> JANGAN HANYA melakukan pencarian dokumen RAG jika pertanyaan meminta data live SAP/tabel SAP spesifik!\n"
        f"2. Gunakan RAG (`rag__search`) HANYA untuk pertanyaan konseptual, panduan manual, dokumen blueprint, atau sebagai fallback jika data live tidak ditemukan.\n\n"
        f"🔴 ATURAN MEMORI & RIWAYAT PERCAKAPAN (SESSION CONTEXT):\n"
        f"1. Anda memiliki akses penuh ke riwayat percakapan sebelumnya dalam sesi ini.\n"
        f"2. Jika pengguna mengajukan pertanyaan lanjutan (follow-up), klarifikasi, atau merujuk pada data/tabel/material/status yang sudah pernah dibahas pada chat sebelumnya:\n"
        f"   - WAJIB BACA dan GUNAKAN konteks data dari riwayat percakapan sebelumnya.\n"
        f"   - JANGAN berhalusinasi, berasumsi liar, atau mengabaikan temuan data sebelumnya.\n"
        f"   - Jika informasi yang ditanyakan sudah lengkap di riwayat sesi ini, Anda BISA langsung menjawab secara cerdas dan akurat.\n"
        f"   - Jika pengguna meminta data/tabel/material baru yang belum ada di riwayat, panggil tool MCP SAP yang relevan.\n\n"
        f"🔴 FORMAT RESPONS WAJIB (BAHASA INDONESIA & COMPACT):\n"
        f"Setiap balasan HARUS selalu diawali dengan header box berikut secara persis:\n"
        f"📦 **MM Server: {sap_server_name} (SID: {sap_sid}) | Mode: LIVE**\n\n"
        f"🔍 **Hasil Investigasi**\n"
        f"Jelaskan hasil pemeriksaan data/tabel secara terstruktur, ringkas, ramah, profesional, dan dalam Bahasa Indonesia murni.\n"
        f"Tampilkan temuan, kode material, tabel yang diperiksa (seperti MARA/MARC), dan status keberadaan data.\n\n"
        f"🔴 ATURAN TAMPILAN RINGKAS (USER-FRIENDLY UNTUK NON-TECHNICAL):\n"
        f"1. JANGAN memecah nama tabel/field/function module ke dalam baris-baris blok kode terpisah (` ```abap `). Ini membuat tampilan chat terlalu panjang dan membingungkan.\n"
        f"2. Tuliskan nama tabel, field, atau tcode secara berdampingan dalam kalimat atau list ringkas (contoh: `VBAP` (Sales Item) & `VBAK` (Sales Header), `CAWN` / `CABN`, `MARA` & `MARC`).\n"
        f"3. Gunakan blok kode terminal HANYA jika Anda menyajikan potongan kode program ABAP utuh multi-baris yang memang perlu disalin oleh developer.\n"
        f"4. Gunakan bullet list ringkas atau tabel markdown yang rapi agar penjelasan padat dan mudah dipahami.\n\n"
        f"DILARANG KERAS mengeluarkan teks pemikiran internal berbahasa Inggris seperti 'We need to answer...', 'We performed a RAG search...', 'Doc 1 snippet:'.\n"
    )

    if not has_sap:
        system_prompt += "PERINGATAN: Koneksi ke server SAP MCP saat ini TERPUTUS. Beritahu pengguna bahwa data live SAP tidak dapat diakses.\n"
    if not has_rag:
        system_prompt += "PERINGATAN: Koneksi ke server RAG MCP saat ini TERPUTUS.\n"

    active_persona = user_persona.strip() or settings.assistant_persona.strip()
    if active_persona:
        system_prompt += (
            f"\n--- PERSONA & ATURAN ASISTEN ---\n"
            f"{active_persona}\n"
            f"---------------------------------\n"
            f"TUGAS PENTING: Anda WAJIB mematuhi format respons dan aturan dari persona di atas secara absolut dalam setiap balasan Anda."
        )
    
    messages = [SystemMessage(content=system_prompt)]
    
    for msg in chat_req.history:
        role = msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", None)
        content = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", None)
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role in ("assistant", "ai"):
            messages.append(AIMessage(content=content))
            
    messages.append(HumanMessage(content=chat_req.message))

    primary_model_name = nine_router_model if nine_router_enabled else openrouter_model
    fallback_model_name = openrouter_fallback_model if openrouter_enabled else primary_model_name

    # 5. Agentic Loop
    sources = []
    max_iterations = 6
    iteration = 0
    
    while iteration < max_iterations:
        iteration += 1
        active_primary = llm_primary_auto
        active_fallback = llm_fallback_auto
        
        try:
            response = await active_primary.ainvoke(messages)
        except Exception as primary_err:
            logger.warning(f"Model utama ({primary_model_name}) gagal: {primary_err}. Menjajal model fallback ({fallback_model_name})...")
            try:
                response = await active_fallback.ainvoke(messages)
            except Exception as fallback_err:
                logger.warning(f"Model fallback dengan tool binding gagal: {fallback_err}. Menjajal fallback plain prompt tanpa tools...")
                try:
                    # Retry terakhir dengan model fallback tanpa tool binding (mengatasi model gratis yg tdk support function calling)
                    response = await llm_fallback.ainvoke(messages)
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
            text_tool_match = re.search(r'(?:call:\s*)?(sap__[a-zA-Z0-9_]+|rag__[a-zA-Z0-9_]+)\s*\(\s*({.*?})\s*\)', raw_content, flags=re.DOTALL)
            if text_tool_match and iteration < max_iterations:
                t_name = text_tool_match.group(1)
                t_args_str = text_tool_match.group(2)
                try:
                    import json
                    t_args = json.loads(t_args_str)
                    logger.info(f"Fallback Text Parser mendeteksi tool call: {t_name} dengan argumen {t_args}")
                    
                    server_name, actual_tool_name = t_name.split("__", 1)
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

            if iteration == 1 and openai_tools and ("thinking process" in response.content.lower() or "identify available tools" in response.content.lower() or "we need to answer" in response.content.lower()):
                logger.info("Mendeteksi LLM mengeluarkan thinking process alih-alih tool_calls. Meminta eksekusi tool ulang...")
                messages.append(HumanMessage(
                    content="SISTEM: Jangan tuliskan teks analisis internal dalam Bahasa Inggris. LANGSUNG panggil tool SAP atau RAG untuk mengecek data pengguna di server SAP yang aktif!"
                ))
                continue

            reply_text = raw_content
            if reply_text.strip():
                break
            if iteration < max_iterations:
                messages.append(HumanMessage(
                    content="Tolong tuliskan jawaban akhir dalam teks biasa (bahasa Indonesia) berdasarkan informasi yang sudah tersedia di atas."
                ))
                continue
            reply_text = "Maaf, saya belum bisa merumuskan jawaban. Silakan ulangi atau perjelas pertanyaan Anda."
            break
            
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
            summary_messages = messages + [
                HumanMessage(content="Berdasarkan seluruh hasil panggilan tool di atas, rangkum dan berikan jawaban akhir yang jelas dan lengkap dalam bahasa Indonesia diawali header box server.")
            ]
            try:
                final_res = await llm_primary.ainvoke(summary_messages)
            except Exception:
                final_res = await llm_fallback.ainvoke(summary_messages)
            reply_text = _extract_text(final_res.content)
            if not reply_text.strip():
                reply_text = "Maaf, data dari tool sudah terkumpul tetapi rangkuman jawaban tidak dapat diproses."
        except Exception as e:
            reply_text = "Proses pencarian selesai. Berikut sebagian informasi dari tool: " + (response.content or "")

    return ChatResponse(reply=reply_text, sources=sources)