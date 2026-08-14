import json
import logging
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage, AIMessage
from mcp_manager import mcp_manager
from models import ChatRequest, ChatResponse, SourceReference
from config import settings

logger = logging.getLogger(__name__)

def _extract_text(content) -> str:
    """Ambil teks dari content AIMessage. Beberapa model/provider mengembalikan
    content sebagai list of parts (mis. [{"type":"text","text":"..."}]) alih-alih
    string, sehingga akses langsung menghasilkan kosong."""
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

async def process_chat(chat_req: ChatRequest, user_role: str) -> ChatResponse:
    # 1. Ambil semua tools dari MCP
    all_mcp_tools = await mcp_manager.get_all_tools()
    
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
        # OpenAI tool name restrictions: a-zA-Z0-9_-
        tool_name = f"{server}__{t.name}".replace("-", "_")
        
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool_name,
                "description": t.description or f"Tool {t.name} dari {server}",
                "parameters": t.inputSchema
            }
        })
        tool_map[tool_name] = {"server": server, "mcp_name": t.name}

    # 3. Setup LLM
    if not settings.openrouter_api_key or settings.openrouter_api_key == "your_openrouter_api_key_here":
        return ChatResponse(
            reply="Mohon maaf, API Key OpenRouter belum dikonfigurasi. Silakan isi melalui Settings.",
            sources=[]
        )
        
    # Gunakan model gratis yang aktif & mendukung tool-calling di OpenRouter
    llm_model_name = getattr(settings, "llm_model", None) or "google/gemma-4-31b-it:free"
    
    llm = ChatOpenAI(
        model=llm_model_name,
        openai_api_key=settings.openrouter_api_key,
        openai_api_base="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": "https://github.com/bud1purwanto/SAP-AI-Assistant",
            "X-Title": "SAP AI Assistant",
        },
        max_retries=1,
        max_tokens=512,
    )

    # Dua varian binding tools:
    # - llm_force : WAJIB memanggil tool (dipakai di giliran pertama) sehingga
    #               agent selalu membaca konteks RAG/MCP dulu sebelum menjawab.
    # - llm_auto  : bebas memilih memanggil tool atau merumuskan jawaban akhir
    #               (dipakai di giliran berikutnya agar loop bisa selesai).
    if openai_tools:
        llm_force = llm.bind_tools(openai_tools, tool_choice="required")
        llm_auto = llm.bind_tools(openai_tools)
    else:
        llm_force = llm
        llm_auto = llm

    system_prompt = (
        f"Anda adalah Enterprise SAP Assistant tingkat lanjut.\n"
        f"Role pengguna saat ini adalah: {user_role}.\n"
    )
    
    if not has_sap:
        system_prompt += "PERINGATAN: Koneksi ke server SAP MCP saat ini TERPUTUS. Anda TIDAK BISA mengakses data live SAP. Beritahu pengguna dengan jujur bahwa Anda belum bisa nyambung ke SAP.\n"
    if not has_rag:
        system_prompt += "PERINGATAN: Koneksi ke server RAG MCP saat ini TERPUTUS. Anda TIDAK BISA mencari dokumen atau manual. Beritahu pengguna dengan jujur bahwa Anda belum bisa nyambung ke RAG.\n"
        
    system_prompt += (
        f"Anda memiliki akses ke berbagai fungsi (tools) dari SAP dan sistem RAG internal.\n"
        f"INSTRUKSI PENTING: Jika pengguna meminta Anda untuk mengecek data SAP, mencari dokumen, atau membaca manual, "
        f"ANDA HARUS LANGSUNG MEMANGGIL TOOL YANG RELEVAN (misal: rag_search, rag_answer, read_table, dll) "
        f"menggunakan kata kunci yang diberikan pengguna. JANGAN BERTANYA KEMBALI meminta ID atau URL jika Anda bisa mencarinya terlebih dahulu dengan tool pencarian yang ada.\n"
        f"Gunakan insting terbaik Anda untuk menebak argumen tool dari pertanyaan pengguna.\n\n"
    )
    
    if settings.assistant_persona:
        system_prompt += (
            f"--- PERSONA & ATURAN ASISTEN (IKUTI DENGAN SANGAT KETAT) ---\n"
            f"{settings.assistant_persona}\n"
            f"------------------------------------------------------------\n"
            f"TUGAS PENTING: Anda WAJIB mematuhi format respons dan aturan dari persona di atas secara absolut dalam setiap balasan Anda, "
            f"termasuk ketika tool gagal, data tidak ditemukan, atau Anda hanya membalas percakapan biasa."
        )
    
    messages = [SystemMessage(content=system_prompt)]
    
    # Masukkan history (opsional). History datang sebagai list of dict dari
    # frontend: {"role": "user"|"assistant", "content": "..."}.
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

    # 5. Agentic Loop
    sources = []
    max_iterations = 6
    iteration = 0
    
    while iteration < max_iterations:
        iteration += 1
        # Giliran pertama: paksa baca konteks (tool). Setelahnya: bebas.
        active_llm = llm_force if (iteration == 1 and openai_tools) else llm_auto
        try:
            response = await active_llm.ainvoke(messages)
        except Exception as e:
            # Jujur soal sumber kegagalan: ini kegagalan panggilan LLM (mis. saldo
            # OpenRouter habis / 402), BUKAN kegagalan RAG/MCP. Jangan menyalahkan RAG.
            err = str(e)
            logger.error(f"LLM invoke error: {err}")
            low = err.lower()
            if "402" in err or "credit" in low or "insufficient" in low or "quota" in low:
                reply_text = (
                    "⚠️ **Layanan AI tidak tersedia**\n\n"
                    "Panggilan ke model AI gagal karena **saldo/kuota OpenRouter habis** (error 402). "
                    "Silakan isi ulang kredit di openrouter.ai, atau ganti ke model gratis (`:free`) melalui **Settings**.\n\n"
                    "_Catatan: koneksi RAG & MCP SAP sendiri berfungsi normal._"
                )
            else:
                reply_text = (
                    "⚠️ **Kesalahan Layanan AI**\n\n"
                    f"Gagal memanggil model AI: {err[:300]}"
                )
            return ChatResponse(reply=reply_text, sources=sources)
        messages.append(response)
        
        # Jika tidak ada pemanggilan tool, berarti LLM sudah memberikan jawaban akhir
        if not response.tool_calls:
            reply_text = _extract_text(response.content)
            if reply_text.strip():
                break
            # Konten kosong (mis. model reasoning kehabisan budget max_tokens, atau
            # balas kosong). Jangan langsung menyerah: beri satu kesempatan lagi
            # selama masih ada iterasi tersisa.
            if iteration < max_iterations:
                messages.append(HumanMessage(
                    content="Tolong tuliskan jawaban akhir dalam teks biasa (bahasa Indonesia) berdasarkan informasi yang sudah tersedia di atas."
                ))
                continue
            reply_text = "Maaf, saya belum bisa merumuskan jawaban. Silakan ulangi atau perjelas pertanyaan Anda."
            break
            
        # Jika ada tool calls, eksekusi tools tersebut
        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_id = tool_call["id"]
            
            logger.info(f"Agent memanggil tool: {tool_name} dengan argumen {tool_args}")
            
            # Cari di tool_map
            if tool_name not in tool_map:
                error_msg = f"Error: Tool {tool_name} tidak ditemukan."
                messages.append(ToolMessage(content=error_msg, tool_call_id=tool_id))
                continue
                
            mapping = tool_map[tool_name]
            server_name = mapping["server"]
            mcp_name = mapping["mcp_name"]
            
            # Eksekusi tool via MCP Manager
            try:
                result = await mcp_manager.call_tool(server_name, mcp_name, tool_args)
                # Parse result
                texts = []
                if result.isError:
                    texts.append(f"Execution Error: {result.content}")
                else:
                    for c in result.content:
                        if c.type == "text":
                            texts.append(c.text)
                            
                content_str = "\n".join(texts)
                messages.append(ToolMessage(content=content_str, tool_call_id=tool_id))
                
                # Catat sebagai source
                sources.append(SourceReference(
                    type="MCP" if server_name == "sap" else "RAG",
                    name=f"Tool: {mcp_name}",
                    content=content_str[:500] + ("..." if len(content_str) > 500 else "") # Truncate for source UI
                ))
            except Exception as e:
                logger.error(f"Error mengeksekusi tool {tool_name}: {e}")
                messages.append(ToolMessage(content=f"System Error: {str(e)}", tool_call_id=tool_id))
    else:
        # Jika loop berhenti karena max_iterations reached, paksa LLM merangkum hasil tanpa tool
        try:
            summary_messages = messages + [
                HumanMessage(content="Berdasarkan seluruh hasil panggilan tool di atas, rangkum dan berikan jawaban akhir yang jelas dan lengkap dalam bahasa Indonesia.")
            ]
            final_res = await llm.ainvoke(summary_messages)
            reply_text = _extract_text(final_res.content)
            if not reply_text.strip():
                reply_text = "Maaf, data dari tool sudah terkumpul tetapi rangkuman jawaban tidak dapat diproses."
        except Exception as e:
            reply_text = "Proses pencarian selesai. Berikut sebagian informasi dari tool: " + (response.content or "")

    return ChatResponse(reply=reply_text, sources=sources)
