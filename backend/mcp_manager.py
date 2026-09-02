import asyncio
import logging
import json
import httpx
from config import settings

logger = logging.getLogger(__name__)

class MCPTool:
    def __init__(self, name: str, description: str = "", input_schema: dict = None):
        self.name = name
        self.description = description
        self.inputSchema = input_schema or {}

class MCPContentItem:
    def __init__(self, text: str, type_: str = "text"):
        self.type = type_
        self.text = text

class MCPCallResult:
    def __init__(self, content: list[MCPContentItem], is_error: bool = False):
        self.content = content
        self.is_error = is_error

    @property
    def isError(self) -> bool:
        """Alias kompatibilitas untuk penamaan gaya JSON-RPC."""
        return self.is_error

class StreamableHttpClient:
    def __init__(self, name: str, url: str, headers: dict):
        self.name = name
        self.url = url
        self.headers = dict(headers or {})
        self.headers.setdefault("Content-Type", "application/json")
        self.headers.setdefault("Accept", "application/json, text/event-stream")
        self.session_id = None
        self._initialized = False

    async def initialize(self, client: httpx.AsyncClient):
        if self._initialized:
            return

        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": f"client-{self.name}", "version": "1.0.0"}
            }
        }
        res = await client.post(self.url, headers=self.headers, json=init_payload, timeout=10.0)
        res.raise_for_status()
        self.session_id = res.headers.get("mcp-session-id")
        
        headers_with_session = dict(self.headers)
        if self.session_id:
            headers_with_session["mcp-session-id"] = self.session_id
            
        await client.post(
            self.url,
            headers=headers_with_session,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            timeout=5.0
        )
        self._initialized = True
        logger.info(f"[{self.name}] Streamable HTTP MCP client initialized successfully.")

        # Initial handshake selesai

    async def list_tools(self, client: httpx.AsyncClient) -> list[MCPTool]:
        await self.initialize(client)
        headers = dict(self.headers)
        if self.session_id:
            headers["mcp-session-id"] = self.session_id
            
        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        res = await client.post(self.url, headers=headers, json=payload, timeout=15.0)
        res.raise_for_status()
        data = res.json()
        
        tools_list = []
        raw_tools = data.get("result", {}).get("tools", [])
        for item in raw_tools:
            tools_list.append(MCPTool(
                name=item.get("name", ""),
                description=item.get("description", ""),
                input_schema=item.get("inputSchema", {})
            ))
        return tools_list

    async def call_tool(self, client: httpx.AsyncClient, tool_name: str, arguments: dict) -> MCPCallResult:
        await self.initialize(client)
        headers = dict(self.headers)
        if self.session_id:
            headers["mcp-session-id"] = self.session_id

        payload = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        try:
            res = await client.post(self.url, headers=headers, json=payload, timeout=45.0)
            res.raise_for_status()
        except Exception:
            self._initialized = False
            raise
        data = res.json()
        
        if "error" in data:
            err_msg = json.dumps(data["error"])
            return MCPCallResult(content=[MCPContentItem(text=err_msg)], is_error=True)

        result_obj = data.get("result", {})
        is_error = result_obj.get("isError", False)
        raw_content = result_obj.get("content", [])

        content_items = []
        if isinstance(raw_content, list):
            for c in raw_content:
                if isinstance(c, dict):
                    content_items.append(MCPContentItem(text=c.get("text", json.dumps(c)), type_=c.get("type", "text")))
                else:
                    content_items.append(MCPContentItem(text=str(c)))
        else:
            content_items.append(MCPContentItem(text=json.dumps(result_obj)))

        return MCPCallResult(content=content_items, is_error=is_error)


class MCPManager:
    def __init__(self):
        self.clients: dict[str, StreamableHttpClient] = {}
        # Server MCP SAP menyimpan "server aktif" sebagai state global di sisi
        # server. Dengan beberapa user bersamaan, request user lain dapat
        # menggeser target di antara set_active_server dan pemanggilan tool,
        # sehingga query dieksekusi ke sistem SAP yang salah tanpa pesan error.
        # Lock ini menjadikan pasangan (set target -> panggil tool) atomik.
        self._sap_lock = asyncio.Lock()
        self._active_sap_target: str | None = None

    def _get_client_config(self, name: str) -> tuple[str, dict]:
        # Coba ambil dynamic config dari database jika tersedia
        try:
            from database import get_system_config
            db_cfg = get_system_config()
        except Exception:
            db_cfg = {}

        if name == "sap":
            config_json_str = db_cfg.get("mcp_sap_config_json") or settings.mcp_sap_config_json
            if not config_json_str:
                # Default fallback jika env var belum ter-load sempurna
                return "http://192.168.1.162:8091/mcp", {"Authorization": "Bearer Trias123"}
            try:
                config = json.loads(config_json_str)
                mcp_servers = config.get("mcpServers", {})
                sap_config = list(mcp_servers.values())[0] if mcp_servers else {}
                return sap_config.get("url", "http://192.168.1.162:8091/mcp"), sap_config.get("headers", {"Authorization": "Bearer Trias123"})
            except Exception:
                return "http://192.168.1.162:8091/mcp", {"Authorization": "Bearer Trias123"}

        elif name == "rag":
            config_json_str = db_cfg.get("mcp_rag_config_json") or settings.mcp_rag_config_json
            if not config_json_str:
                # Default fallback jika env var belum ter-load sempurna
                return "http://192.168.1.162:8090/mcp", {"Authorization": "Bearer Trias123"}
            try:
                config = json.loads(config_json_str)
                mcp_servers = config.get("mcpServers", {})
                rag_config = mcp_servers.get("manufacturing-rag", list(mcp_servers.values())[0] if mcp_servers else {})
                return rag_config.get("url", "http://192.168.1.162:8090/mcp"), rag_config.get("headers", {"Authorization": "Bearer Trias123"})
            except Exception:
                return "http://192.168.1.162:8090/mcp", {"Authorization": "Bearer Trias123"}

        elif name in ("sql", "email"):
            config_json_str = (
                db_cfg.get("mcp_sql_config_json")
                or db_cfg.get("mcp_email_config_json")
                or getattr(settings, "mcp_sql_config_json", "")
                or getattr(settings, "mcp_email_config_json", "")
            )
            if not config_json_str:
                return "http://192.168.1.162:8093/mcp", {"Authorization": "Bearer Trias123"}
            try:
                config = json.loads(config_json_str)
                mcp_servers = config.get("mcpServers", {})
                sql_config = mcp_servers.get("sql-mcp", mcp_servers.get("email-mcp", list(mcp_servers.values())[0] if mcp_servers else {}))
                return sql_config.get("url", "http://192.168.1.162:8093/mcp"), sql_config.get("headers", {"Authorization": "Bearer Trias123"})
            except Exception:
                return "http://192.168.1.162:8093/mcp", {"Authorization": "Bearer Trias123"}
        else:
            raise ValueError(f"Unknown MCP server name: {name}")

    def get_client(self, name: str) -> StreamableHttpClient:
        url, headers = self._get_client_config(name)
        if name not in self.clients or self.clients[name].url != url or self.clients[name].headers != headers:
            self.clients[name] = StreamableHttpClient(name=name, url=url, headers=headers)
        return self.clients[name]

    async def check_servers_status(self) -> dict:
        status = {}
        async with httpx.AsyncClient() as http_client:
            # SAP Server status
            try:
                sap_client = self.get_client("sap")
                sap_tools = await sap_client.list_tools(http_client)
                
                sub_servers = []
                active_server_name = "Default"
                try:
                    srv_res = await sap_client.call_tool(http_client, "list_servers", {})
                    if srv_res and not srv_res.isError and srv_res.content:
                        txt = srv_res.content[0].text
                        srv_data = json.loads(txt)
                        sub_servers = srv_data.get("servers", [])
                        for s in sub_servers:
                            if s.get("active"):
                                active_server_name = s.get("name") or s.get("sid") or "Active"
                except Exception as ex:
                    logger.warning(f"Gagal mengambil daftar sub-servers SAP: {ex}")

                status["sap"] = {
                    "id": "sap",
                    "name": "SAP ECC 6.0 Server",
                    "description": "Live Data, Tabel & ABAP Code SAP",
                    "online": True,
                    "status": "online",
                    "tool_count": len(sap_tools),
                    "tools_count": len(sap_tools),
                    "active_server": active_server_name,
                    "sub_servers": sub_servers
                }
            except Exception as e:
                logger.error(f"Error checking SAP server: {e}")
                status["sap"] = {
                    "id": "sap",
                    "name": "SAP ECC 6.0 Server",
                    "description": "Live Data, Tabel & ABAP Code SAP",
                    "online": False,
                    "status": "offline",
                    "tool_count": 0,
                    "tools_count": 0,
                    "active_server": "-",
                    "sub_servers": [],
                    "error": str(e)
                }

            # RAG Server status
            try:
                rag_client = self.get_client("rag")
                rag_tools = await rag_client.list_tools(http_client)
                status["rag"] = {
                    "id": "rag",
                    "name": "Manufacturing RAG",
                    "description": "Enterprise Document & Knowledge Base",
                    "online": True,
                    "status": "online",
                    "tool_count": len(rag_tools),
                    "tools_count": len(rag_tools)
                }
            except Exception as e:
                logger.error(f"Error checking RAG server: {e}")
                status["rag"] = {
                    "id": "rag",
                    "name": "Manufacturing RAG",
                    "description": "Enterprise Document & Knowledge Base",
                    "online": False,
                    "status": "offline",
                    "tool_count": 0,
                    "tools_count": 0,
                    "error": str(e)
                }

            # SQL Server status
            try:
                sql_client = self.get_client("sql")
                sql_tools = await sql_client.list_tools(http_client)
                sql_info = {
                    "id": "sql",
                    "name": "MCP SQL Server",
                    "description": "Direct SQL Query & Database Gateway",
                    "online": True,
                    "status": "online",
                    "tool_count": len(sql_tools),
                    "tools_count": len(sql_tools)
                }
                status["sql"] = sql_info
                status["email"] = {**sql_info, "id": "email"}
            except Exception as e:
                logger.error(f"Error checking SQL MCP server: {e}")
                sql_err = {
                    "id": "sql",
                    "name": "MCP SQL Server",
                    "description": "Direct SQL Query & Database Gateway",
                    "online": False,
                    "status": "offline",
                    "tool_count": 0,
                    "tools_count": 0,
                    "error": str(e)
                }
                status["sql"] = sql_err
                status["email"] = {**sql_err, "id": "email"}

        return status

    async def _set_active_sap_server_unlocked(self, http_client, target_sap: str):
        """Set server aktif pada MCP SAP. Pemanggil wajib memegang _sap_lock."""
        if self._active_sap_target and str(self._active_sap_target).strip().lower() == str(target_sap).strip().lower():
            # Server sudah aktif pada sesi koneksi ini. Jangan reset koneksi agar LUW buffer SAP tidak ter-rollback!
            return True
        sap_client = self.get_client("sap")
        last_error = None
        for attempt in range(2):
            try:
                res = await sap_client.call_tool(http_client, "set_active_server", {"server_ref": target_sap})
                if res.is_error:
                    err_txt = " ".join(c.text for c in res.content) if res.content else "Unknown error"
                    logger.warning(f"MCP server gagal menset SAP active server ke '{target_sap}': {err_txt}")
                    self._active_sap_target = None
                    return False

                if res.content and res.content[0].text:
                    try:
                        data = json.loads(res.content[0].text)
                        if data.get("success") is False:
                            err_msg = data.get("error", "Server ref not recognized")
                            logger.warning(f"MCP server menolak target SAP '{target_sap}': {err_msg}")
                            self._active_sap_target = None
                            return False
                    except Exception:
                        pass

                self._active_sap_target = target_sap
                logger.info(f"SAP Active Server diset ke '{target_sap}': {[c.text for c in res.content]}")
                return True
            except Exception as ex:
                last_error = ex
                sap_client._initialized = False
                self._active_sap_target = None
                logger.warning(f"Percobaan {attempt + 1}/2: Tidak dapat menset SAP active server ke '{target_sap}': {type(ex).__name__} ({ex or 'timeout/network'})")
                if attempt == 0:
                    await asyncio.sleep(0.5)

        self._active_sap_target = None
        logger.error(f"Gagal menset SAP active server ke '{target_sap}' setelah 2 percobaan: {type(last_error).__name__} ({last_error or 'timeout'})")
        return False

    async def set_active_sap_server(self, target_sap: str):
        """Set server aktif pada MCP SAP (dilindungi lock)."""
        if not target_sap:
            return
        async with self._sap_lock:
            async with httpx.AsyncClient() as http_client:
                await self._set_active_sap_server_unlocked(http_client, target_sap)

    async def get_all_tools(self, server_filter: str = "all") -> list[dict]:
        tools = []
        is_sap = True  # SAP selalu aktif
        is_rag = True  # RAG selalu aktif - kedua server wajib terhubung

        async with httpx.AsyncClient() as http_client:
            # SAP Tools
            if is_sap:
                try:
                    sap_client = self.get_client("sap")
                    sap_tools = await sap_client.list_tools(http_client)
                    for t in sap_tools:
                        tools.append({"server": "sap", "tool": t})
                except Exception as e:
                    logger.error(f"Error fetching SAP tools: {e}")

            # RAG Tools
            if is_rag:
                try:
                    rag_client = self.get_client("rag")
                    rag_tools = await rag_client.list_tools(http_client)
                    for t in rag_tools:
                        tools.append({"server": "rag", "tool": t})
                except Exception as e:
                    logger.error(f"Error fetching RAG tools: {e}")

            # SQL Tools
            try:
                sql_client = self.get_client("sql")
                sql_tools = await sql_client.list_tools(http_client)
                for t in sql_tools:
                    tools.append({"server": "sql", "tool": t})
            except Exception as e:
                logger.warning(f"Error fetching SQL tools (MCP SQL offline or unavailable): {e}")

        return tools

    async def call_tool(
        self,
        server_name: str,
        tool_name: str,
        arguments: dict,
        sap_target: str = None,
    ) -> MCPCallResult:
        """Panggil satu tool MCP.

        Untuk server SAP, `sap_target` menyatakan sistem SAP mana yang dituju.
        Penetapan target dan pemanggilan tool dilakukan di bawah satu lock agar
        request user lain tidak dapat menyisip di antaranya dan mengalihkan
        query ke sistem yang salah.
        """
        # Bersihkan meta-key yang lazim disisipkan LLM (seperti 'reason', 'comment', 'note')
        # yang ditolak ketat oleh interface PyRFC SAP ('field reason not found').
        final_args = arguments
        if server_name == "sap" and isinstance(arguments, dict):
            final_args = self._sanitize_sap_arguments(tool_name, arguments)

        if server_name == "sap" and sap_target:
            async with self._sap_lock:
                async with httpx.AsyncClient() as http_client:
                    ok = await self._set_active_sap_server_unlocked(http_client, sap_target)
                    if not ok:
                        return MCPCallResult(
                            content=[MCPContentItem(
                                text=(
                                    f"Gagal mengarahkan permintaan ke sistem SAP '{sap_target}'. "
                                    "Tool tidak dijalankan untuk menghindari eksekusi pada sistem yang salah."
                                )
                            )],
                            is_error=True,
                        )
                    client = self.get_client(server_name)
                    return await self._handle_sap_call(http_client, client, tool_name, final_args)

        async with httpx.AsyncClient() as http_client:
            client = self.get_client(server_name)
            if server_name == "sap":
                return await self._handle_sap_call(http_client, client, tool_name, final_args)
            return await client.call_tool(http_client, tool_name, final_args)

    @staticmethod
    def _is_mutation_bapi(func_name: str) -> bool:
        if not func_name:
            return False
        u = str(func_name).upper()
        return (
            u.startswith("BAPI_")
            and any(k in u for k in ["CREATE", "CHANGE", "POST", "CANCEL", "RELEASE", "CONFIRM"])
            and "COMMIT" not in u
            and "ROLLBACK" not in u
        )

    async def _handle_sap_call(self, http_client, client, tool_name: str, final_args: dict) -> MCPCallResult:
        """Eksekusi tool SAP dengan perlindungan Atomic Auto-Commit untuk BAPI mutasi."""
        res = await client.call_tool(http_client, tool_name, final_args)
        if tool_name != "call_function" or res.is_error or not res.content:
            return res

        func_name = str(final_args.get("function_name", ""))
        auto_commit_requested = final_args.get("commit") is True or final_args.get("auto_commit") is True
        if self._is_mutation_bapi(func_name) or auto_commit_requested:
            try:
                raw_text = res.content[0].text
                data = json.loads(raw_text)
                res_data = data.get("result", {})
                returns = res_data.get("RETURN", [])
                if isinstance(returns, dict):
                    returns = [returns]
                has_error = any(
                    isinstance(r, dict) and str(r.get("TYPE", "")).upper() in ("E", "A")
                    for r in returns
                )

                if not has_error:
                    logger.info(f"Menjalankan Atomic Auto-Commit untuk {func_name} pada sesi koneksi SAP aktif...")
                    await client.call_tool(http_client, "call_function", {
                        "function_name": "BAPI_TRANSACTION_COMMIT",
                        "parameters": {"WAIT": "X"}
                    })
                    data["auto_commit"] = {
                        "status": "SUCCESS",
                        "message": "Dokumen berhasil di-commit secara permanen ke database SAP (Single LUW)."
                    }
                    res.content[0].text = json.dumps(data, indent=2)
                else:
                    logger.warning(f"BAPI {func_name} memiliki pesan error, menjalankan rollback otomatis...")
                    await client.call_tool(http_client, "call_function", {
                        "function_name": "BAPI_TRANSACTION_ROLLBACK",
                        "parameters": {}
                    })
                    data["auto_commit"] = {
                        "status": "ROLLED_BACK",
                        "message": "BAPI dibatalkan karena terdapat pesan error Type E/A."
                    }
                    res.content[0].text = json.dumps(data, indent=2)
            except Exception as ex:
                logger.warning(f"Pengecualian saat auto-commit untuk {func_name}: {ex}")

        return res

    @staticmethod
    def _sanitize_sap_arguments(tool_name: str, arguments: dict) -> dict:
        """Bersihkan meta-field yang dihasilkan LLM dari parameter RFC/BAPI SAP."""
        METAKEYS = {
            "reason", "explanation", "comment", "note", "description",
            "keterangan", "alasan", "justification", "intent", "purpose"
        }

        def _clean(val):
            if isinstance(val, dict):
                return {
                    k: _clean(v)
                    for k, v in val.items()
                    if str(k).lower() not in METAKEYS
                }
            if isinstance(val, list):
                return [_clean(x) for x in val]
            return val

        cleaned = _clean(arguments)
        if tool_name == "call_function" and "parameters" in cleaned and isinstance(cleaned["parameters"], dict):
            # Pastikan dict parameters bersih dari meta-keys
            cleaned["parameters"] = _clean(cleaned["parameters"])
        return cleaned

mcp_manager = MCPManager()