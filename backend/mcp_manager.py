import asyncio
import logging
import json
import re
import time
from typing import Optional, Set
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
        self._tools_cache: list[MCPTool] = None
        self._tools_cache_time: float = 0.0

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

    async def list_tools(self, client: httpx.AsyncClient, force_refresh: bool = False) -> list[MCPTool]:
        now = time.time()
        if not force_refresh and self._tools_cache is not None and (now - self._tools_cache_time < 60.0):
            return self._tools_cache

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
        self._tools_cache = tools_list
        self._tools_cache_time = now
        return tools_list

    def clear_tools_cache(self):
        """Mengosongkan cache daftar tool untuk memicu refresh saat konfigurasi diubah."""
        self._tools_cache = None
        self._tools_cache_time = 0.0

    async def call_tool(
        self,
        client: httpx.AsyncClient,
        tool_name: str,
        arguments: dict,
        extra_headers: Optional[dict] = None,
    ) -> MCPCallResult:
        await self.initialize(client)
        headers = dict(self.headers)
        if self.session_id:
            headers["mcp-session-id"] = self.session_id
        if extra_headers:
            headers.update(extra_headers)

        actual_tool_name = tool_name
        if self.url.rstrip("/").endswith("/v1/gateway") and "__" not in tool_name:
            prefix_map = {
                "sap": "sap-leader-mcp__",
                "sql": "mcp-sql__",
                "email": "mcp-email__",
                "gitea": "mcp-gitea__",
                "rag": "mcp-rag__",
            }
            prefix = prefix_map.get(self.name, "")
            actual_tool_name = f"{prefix}{tool_name}"

        payload = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": actual_tool_name,
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


EMAIL_TOOL_NAMES = {
    "search_emails",
    "read_email",
    "get_calendar",
    "get_email_image",
    "send_email",
    "search_archive",
    "read_archived_email",
    "restore_email_to_inbox",
}


def is_email_tool(tool_name: str) -> bool:
    """Mendeteksi apakah tool MCP termasuk dalam kapabilitas email/mail archive/exchange."""
    if not tool_name:
        return False
    name = str(tool_name).lower()
    if name in EMAIL_TOOL_NAMES:
        return True
    return any(kw in name for kw in ("email", "mail", "calendar", "inbox", "archive"))


def strip_gateway_tool_prefix(tool_name: str) -> str:
    """Return the upstream MCP tool name without Dashboard gateway namespace."""
    name = str(tool_name or "")
    return name.split("__", 1)[1] if "__" in name else name


def classify_gateway_tool(tool_name: str) -> str:
    """Classify a tool name returned by the Dashboard gateway."""
    name = str(tool_name or "").lower()
    base = strip_gateway_tool_prefix(name)
    if name.startswith("mcp-sql__") or base.startswith("sql_"):
        return "sql"
    if name.startswith("mcp-email__") or is_email_tool(base):
        return "email"
    if name.startswith("mcp-rag__") or base.startswith("rag_"):
        return "rag"
    if name.startswith("sap-leader-mcp__") or base.startswith("sap_"):
        return "sap"
    return "rag"


def is_internal_rag_tool(tool_name: str) -> bool:
    return strip_gateway_tool_prefix(tool_name) in RAG_INTERNAL_EXCLUDED_TOOLS


def is_sql_admin_tool(tool_name: str) -> bool:
    return strip_gateway_tool_prefix(tool_name) == "sql_reload_config"


# Tool internal/administratif gateway RAG yang tidak relevan untuk user chat atau duplikat
RAG_INTERNAL_EXCLUDED_TOOLS = {
    "draft_action",
    "confirm_action",
    "system_health",
    "document_sources",
    "document_get",  # Duplikat fungsional dari rag_get_document
}


class MCPManager:
    def __init__(self):
        self.clients: dict[tuple[str, str], StreamableHttpClient] = {}
        # Server MCP SAP menyimpan "server aktif" sebagai state global di sisi
        # server. Dengan beberapa user bersamaan, request user lain dapat
        # menggeser target di antara set_active_server dan pemanggilan tool,
        # sehingga query dieksekusi ke sistem SAP yang salah tanpa pesan error.
        # Lock ini menjadikan pasangan (set target -> panggil tool) atomik.
        self._sap_lock = asyncio.Lock()
        self._active_sap_target: str | None = None
        self._resources_cache: list[dict] = []
        self._resources_cache_time: float = 0.0
        self._cache_ttl: float = 10.0

    def _get_client_config(self, name: str) -> tuple[str, dict]:
        """Resolve the Dashboard MCP Gateway URL for the named connector.

        All MCP traffic is routed exclusively through ``settings.dashboard_mcp_gateway_url``.
        The Dashboard gateway performs upstream routing and MCP authorization; SAP no
        longer stores or forwards direct upstream URLs or static bearer tokens such as
        ``Trias123``.

        Aggregate connectors (sap/rag/sql/email) hit the gateway base; named routes use
        ``{gateway}/{name}`` only when the Dashboard grants that server.
        """
        gateway_base = (settings.dashboard_mcp_gateway_url or "").rstrip("/")
        if not gateway_base:
            raise RuntimeError(
                "dashboard_mcp_gateway_url is not configured — SAP cannot route MCP traffic."
            )
        # Aggregate connectors are served at the gateway base; the gateway fans out
        # to the appropriate upstream based on the JSON-RPC method/tool name.
        # Named (custom) connectors are addressed at {gateway}/{name}.
        if name in ("sap", "rag", "sql", "email"):
            url = gateway_base
        else:
            url = f"{gateway_base}/{name}"
        # No static upstream auth token — the Dashboard gateway authenticates the
        # SAP backend via a service assertion / shared-secret header (see get_client).
        headers: dict = {}
        return url, headers

    def get_client(self, name: str) -> StreamableHttpClient:
        """Return a per-user Dashboard Gateway client with a required bearer token."""
        from auth import get_dashboard_access_token

        access_token = get_dashboard_access_token()
        # If access_token is an internal local JWT (HS256 from local auth),
        # the Dashboard Gateway expects RS256 or an ApiClient token.
        # Fall back to dashboard_mcp_api_token if configured.
        if access_token and access_token.count(".") == 2:
            try:
                import jwt as _jwt
                unverified = _jwt.get_unverified_header(access_token)
                if unverified.get("alg") != "RS256" and getattr(settings, "dashboard_mcp_api_token", None):
                    access_token = settings.dashboard_mcp_api_token
            except Exception:
                pass

        if not access_token and getattr(settings, "dashboard_mcp_api_token", None):
            access_token = settings.dashboard_mcp_api_token
        if not access_token:
            raise PermissionError("Dashboard access token is required for MCP gateway requests.")
        url, headers = self._get_client_config(name)
        gw_headers = dict(headers or {})
        gw_headers["Authorization"] = f"Bearer {access_token}"
        cache_key = (name, access_token)
        if cache_key not in self.clients or self.clients[cache_key].url != url:
            self.clients[cache_key] = StreamableHttpClient(name=name, url=url, headers=gw_headers)
        return self.clients[cache_key]

    def remove_client(self, name: str):
        """Hapus instance client yang di-cache saat konfigurasi server berubah atau dihapus."""
        for cache_key in [key for key in self.clients if key[0] == name]:
            del self.clients[cache_key]

    def clear_client_cache(self, name: Optional[str] = None):
        """Bersihkan cache tool dari client tertentu atau semua client."""
        if name:
            for cache_key in [key for key in self.clients if key[0] == name]:
                self.clients[cache_key].clear_tools_cache()
        else:
            for client in self.clients.values():
                client.clear_tools_cache()

    async def test_connection(self, url: str, auth_token: str = "", headers: dict = None, transport_type: str = "http") -> dict:
        """Menguji koneksi server MCP secara real-time dengan mengukur latensi dan memeriksa tool."""
        start_time = time.perf_counter()
        req_headers = dict(headers or {})
        if auth_token and auth_token.strip():
            req_headers["Authorization"] = f"Bearer {auth_token.strip()}"
        req_headers.setdefault("Content-Type", "application/json")
        req_headers.setdefault("Accept", "application/json, text/event-stream")

        temp_client = StreamableHttpClient(name="test_conn", url=url.strip(), headers=req_headers)
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            try:
                tools = await temp_client.list_tools(http_client, force_refresh=True)
                elapsed_ms = round((time.perf_counter() - start_time) * 1000)
                tool_names = [t.name for t in tools]
                return {
                    "success": True,
                    "online": True,
                    "latency_ms": elapsed_ms,
                    "tool_count": len(tools),
                    "tools": tool_names[:15],
                    "message": f"Koneksi berhasil ({len(tools)} tools terdeteksi, {elapsed_ms}ms)"
                }
            except httpx.HTTPStatusError as e:
                elapsed_ms = round((time.perf_counter() - start_time) * 1000)
                status_code = e.response.status_code if e.response else 500
                return {
                    "success": False,
                    "online": False,
                    "latency_ms": elapsed_ms,
                    "tool_count": 0,
                    "message": f"HTTP Error {status_code}: {e.response.text[:200] if e.response else str(e)}"
                }
            except httpx.ConnectError:
                elapsed_ms = round((time.perf_counter() - start_time) * 1000)
                return {
                    "success": False,
                    "online": False,
                    "latency_ms": elapsed_ms,
                    "tool_count": 0,
                    "message": "Gagal terhubung ke host/port (Connection refused atau host tidak ditemukan)."
                }
            except httpx.TimeoutException:
                elapsed_ms = round((time.perf_counter() - start_time) * 1000)
                return {
                    "success": False,
                    "online": False,
                    "latency_ms": elapsed_ms,
                    "tool_count": 0,
                    "message": f"Timeout ({elapsed_ms}ms): server tidak merespon dalam batas waktu."
                }
            except Exception as e:
                elapsed_ms = round((time.perf_counter() - start_time) * 1000)
                return {
                    "success": False,
                    "online": False,
                    "latency_ms": elapsed_ms,
                    "tool_count": 0,
                    "message": f"Koneksi gagal: {str(e)}"
                }

    async def _fetch_dashboard_resources(self, http_client: httpx.AsyncClient) -> Optional[dict]:
        """Ambil list resource & status server dinamis dari Dashboard MCP jika tersedia."""
        if not settings.dashboard_mcp_url:
            return None
        url = f"{settings.dashboard_mcp_url.rstrip('/')}/v1/integration/resources"
        headers = {}
        if settings.dashboard_mcp_api_token:
            headers["Authorization"] = f"Bearer {settings.dashboard_mcp_api_token}"
        try:
            r = await http_client.get(url, headers=headers, timeout=4.0)
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, dict):
                    resources = data.get("resources", [])
                    if isinstance(resources, list):
                        self._resources_cache = resources
                        self._resources_cache_time = time.time()
                return data
        except Exception as ex:
            logger.debug(f"Dashboard MCP resources endpoint tidak dapat dihubungi: {ex}")
        return None

    async def check_servers_status(self) -> dict:
        status = {}
        # Dapatkan list server dari tabel ai_assistant_dev.mcp_servers jika ada
        db_servers_dict = {}
        try:
            from database import list_mcp_servers
            db_list = list_mcp_servers(enabled_only=False)
            db_servers_dict = {s["id"]: s for s in db_list}
        except Exception as ex:
            logger.debug(f"Sync fetch dashboard resources gagal: {ex}")

        return self._resources_cache

    async def check_servers_status(self) -> dict:
        """Cek status seluruh server MCP dengan dashboard-mcp sebagai sumber otoritatif utama."""
        try:
            async with httpx.AsyncClient() as http_client:
                dash_data = await self._fetch_dashboard_resources(http_client)
        except Exception as ex:
            logger.warning(f"Error fetching dashboard MCP resources: {ex}")
            dash_data = None

        if dash_data and isinstance(dash_data, dict):
            resources = dash_data.get("resources", [])
            dash_status = dash_data.get("status", {})
            if isinstance(resources, list):
                self._resources_cache = resources
                self._resources_cache_time = time.time()

            # Format SAP sub_servers dari resources
            sap_sub_servers = []
            for r in resources:
                if r.get("kind") == "sap":
                    srv = dict(r)
                    srv["name"] = r.get("label") or r.get("name") or r.get("sid") or r.get("resource_key", "SAP")
                    srv["client"] = str(r.get("client") or "130")
                    srv["sid"] = r.get("sid") or ""
                    srv["resource_key"] = r.get("resource_key") or f"sap:{srv['name'].lower()}"
                    sap_sub_servers.append(srv)

            # Format SQL sub_servers dari resources
            sql_sub_servers = []
            for r in resources:
                if r.get("kind") == "sql":
                    srv = dict(r)
                    srv["name"] = r.get("label") or r.get("name") or r.get("resource_key", "SQL")
                    sql_sub_servers.append(srv)

            # 1. SAP Server status
            sap_dash = (dash_status.get("sap") or dash_status.get("mcp_sap") or {}) if isinstance(dash_status, dict) else {}
            sap_online = bool(sap_dash.get("online", bool(sap_sub_servers) or bool(sap_dash)))
            sap_tool_count = sap_dash.get("tool_count") or sap_dash.get("tools_count") or (6 if sap_online else 0)
            active_sap = sap_dash.get("active_server") or (sap_sub_servers[0]["name"] if sap_sub_servers else ("Default" if sap_online else "-"))
            sap_status = {
                "id": "sap",
                "name": sap_dash.get("name") or "SAP ERP Gateway",
                "description": sap_dash.get("description") or "Live Data, Tabel & ABAP Code SAP",
                "online": sap_online,
                "status": sap_dash.get("status", "online" if sap_online else "offline"),
                "enabled": sap_dash.get("enabled", True),
                "is_system": True,
                "tool_count": sap_tool_count,
                "tools_count": sap_tool_count,
                "active_server": active_sap,
                "sub_servers": sap_sub_servers,
                "display_order": sap_dash.get("display_order", 1),
                "icon": sap_dash.get("icon", "Database"),
            }

            # 2. RAG Server status
            rag_dash = (dash_status.get("rag") or dash_status.get("mcp_rag") or {}) if isinstance(dash_status, dict) else {}
            rag_online = bool(rag_dash.get("online", bool(rag_dash)))
            rag_tool_count = rag_dash.get("tool_count") or rag_dash.get("tools_count") or (6 if rag_online else 0)
            rag_status = {
                "id": "rag",
                "name": rag_dash.get("name") or "RAG Knowledge Gateway",
                "description": rag_dash.get("description") or "Vector DB, SOP & Tech Docs",
                "online": rag_online,
                "status": rag_dash.get("status", "online" if rag_online else "offline"),
                "enabled": rag_dash.get("enabled", True),
                "is_system": True,
                "tool_count": rag_tool_count,
                "tools_count": rag_tool_count,
                "active_server": rag_dash.get("active_server", "Vector & Doc" if rag_online else "-"),
                "display_order": rag_dash.get("display_order", 2),
                "icon": rag_dash.get("icon", "BookOpen"),
            }

            # 3. SQL Server status
            sql_dash = (dash_status.get("sql") or dash_status.get("mcp_sql") or {}) if isinstance(dash_status, dict) else {}
            sql_online = bool(sql_dash.get("online", bool(sql_sub_servers) or bool(sql_dash)))
            sql_tool_count = sql_dash.get("tool_count") or sql_dash.get("tools_count") or (7 if sql_online else 0)
            active_sql = sql_dash.get("active_server") or (sql_sub_servers[0]["name"] if sql_sub_servers else ("Default" if sql_online else "-"))
            sql_status = {
                "id": "sql",
                "name": sql_dash.get("name") or "SQL & Database Gateway",
                "description": sql_dash.get("description") or "Relational SQL & Query Tools",
                "online": sql_online,
                "status": sql_dash.get("status", "online" if sql_online else "offline"),
                "enabled": sql_dash.get("enabled", True),
                "is_system": True,
                "tool_count": sql_tool_count,
                "tools_count": sql_tool_count,
                "active_server": active_sql,
                "sub_servers": sql_sub_servers,
                "display_order": sql_dash.get("display_order", 3),
                "icon": sql_dash.get("icon", "Server"),
            }

            # 4. Email Server status
            email_dash = (dash_status.get("email") or dash_status.get("mcp_email") or {}) if isinstance(dash_status, dict) else {}
            email_online = bool(email_dash.get("online", bool(email_dash)))
            email_tool_count = email_dash.get("tool_count") or email_dash.get("tools_count") or (8 if email_online else 0)
            email_status = {
                "id": "email",
                "name": email_dash.get("name") or "Email Gateway",
                "description": email_dash.get("description") or "Email, Calendar & Mail Archive Gateway",
                "online": email_online,
                "status": email_dash.get("status", "online" if email_online else "offline"),
                "enabled": email_dash.get("enabled", True),
                "is_system": True,
                "tool_count": email_tool_count,
                "tools_count": email_tool_count,
                "active_server": email_dash.get("active_server", "Mail Archive" if email_online else "-"),
                "display_order": email_dash.get("display_order", 4),
                "icon": email_dash.get("icon", "Mail"),
            }

            status = {
                "sap": sap_status,
                "rag": rag_status,
                "sql": sql_status,
                "email": email_status,
            }

            known_server_keys = {
                "sap", "rag", "sql", "email",
                "mcp_sap", "mcp_rag", "mcp_sql", "mcp_email", "mcp_gitea",
                "sap-leader-mcp", "mcp-rag", "mcp-sql", "mcp-email", "mcp-gitea",
            }

            # Custom servers in dash_status
            if isinstance(dash_status, dict):
                for sid, s_data in dash_status.items():
                    if sid in known_server_keys or (isinstance(sid, str) and re.match(r"^[0-9a-fA-F-]{36}$", sid)):
                        continue
                    s_online = bool(s_data.get("online", False))
                    s_tools = s_data.get("tool_count", s_data.get("tools_count", 0))
                    status[sid] = {
                        "id": sid,
                        "name": s_data.get("name") or sid,
                        "description": s_data.get("description", ""),
                        "online": s_online,
                        "status": s_data.get("status", "online" if s_online else "offline"),
                        "enabled": s_data.get("enabled", True),
                        "is_system": False,
                        "tool_count": s_tools,
                        "tools_count": s_tools,
                        "active_server": s_data.get("active_server", "Active" if s_online else "-"),
                        "display_order": s_data.get("display_order", 99),
                        "icon": s_data.get("icon", "Server"),
                    }

            # Custom servers in resources that might not be in dash_status
            for r in resources:
                raw_sid = r.get("serverId") or r.get("server_id") or ""
                if re.match(r"^[0-9a-fA-F-]{36}$", str(raw_sid)):
                    raw_sid = ""
                sid = raw_sid
                if not sid and ":" in r.get("resource_key", ""):
                    prefix = r["resource_key"].split(":", 1)[0]
                    if prefix not in ("sap", "rag", "sql", "email", "service"):
                        sid = prefix
                if sid and sid not in status and sid not in known_server_keys and not re.match(r"^[0-9a-fA-F-]{36}$", str(sid)):
                    status[sid] = {
                        "id": sid,
                        "name": r.get("server_name") or r.get("label") or sid,
                        "description": r.get("description", ""),
                        "online": True,
                        "status": "online",
                        "enabled": True,
                        "is_system": False,
                        "tool_count": 0,
                        "tools_count": 0,
                        "active_server": "Active",
                        "display_order": 99,
                        "icon": "Server",
                    }
            return status

        # Fallback offline status jika dashboard-mcp tidak dapat dihubungi
        return {
            "sap": {
                "id": "sap",
                "name": "SAP ERP Gateway",
                "description": "Live Data, Tabel & ABAP Code SAP",
                "online": False,
                "status": "offline",
                "enabled": True,
                "is_system": True,
                "tool_count": 0,
                "tools_count": 0,
                "active_server": "-",
                "sub_servers": [],
                "display_order": 1,
                "icon": "Database",
            },
            "rag": {
                "id": "rag",
                "name": "RAG Knowledge Gateway",
                "description": "Vector DB, SOP & Tech Docs",
                "online": False,
                "status": "offline",
                "enabled": True,
                "is_system": True,
                "tool_count": 0,
                "tools_count": 0,
                "active_server": "-",
                "display_order": 2,
                "icon": "BookOpen",
            },
            "sql": {
                "id": "sql",
                "name": "SQL & Database Gateway",
                "description": "Relational SQL & Query Tools",
                "online": False,
                "status": "offline",
                "enabled": True,
                "is_system": True,
                "tool_count": 0,
                "tools_count": 0,
                "active_server": "-",
                "sub_servers": [],
                "display_order": 3,
                "icon": "Server",
            },
            "email": {
                "id": "email",
                "name": "Email Gateway",
                "description": "Email, Calendar & Mail Archive Gateway",
                "online": False,
                "status": "offline",
                "enabled": True,
                "is_system": True,
                "tool_count": 0,
                "tools_count": 0,
                "active_server": "-",
                "display_order": 4,
                "icon": "Mail",
            },
        }

    async def _set_active_sap_server_unlocked(
        self,
        http_client,
        target_sap: str,
        sap_credentials: Optional[dict] = None,
        extra_headers: Optional[dict] = None,
    ):
        """Set server aktif pada MCP SAP dengan opsi kredensial per-user. Pemanggil wajib memegang _sap_lock."""
        sap_client = self.get_client("sap")
        last_error = None
        try:
            import access_control
            sap_resource_key = access_control.canonical_resource_key(f"sap:{target_sap}")
        except Exception:
            sap_resource_key = target_sap if str(target_sap).startswith("sap:") else f"sap:{target_sap}"
        payload = {"server_ref": target_sap, "resource_key": sap_resource_key}
        if sap_credentials:
            if sap_credentials.get("sap_user"):
                payload["user"] = sap_credentials["sap_user"]
            if sap_credentials.get("sap_password"):
                payload["password"] = sap_credentials["sap_password"]
            if sap_credentials.get("sap_client"):
                payload["client"] = sap_credentials["sap_client"]

        req_headers = dict(extra_headers or {})
        if target_sap and "X-SAP-Server" not in req_headers:
            req_headers["X-SAP-Server"] = target_sap
        if sap_credentials:
            if sap_credentials.get("sap_user") and "X-SAP-User" not in req_headers:
                req_headers["X-SAP-User"] = sap_credentials["sap_user"]
            if sap_credentials.get("sap_password") and "X-SAP-Password" not in req_headers:
                req_headers["X-SAP-Password"] = sap_credentials["sap_password"]
            if sap_credentials.get("sap_client") and "X-SAP-Client" not in req_headers:
                req_headers["X-SAP-Client"] = sap_credentials["sap_client"]
            if sap_credentials.get("sap_language") and "X-SAP-Language" not in req_headers:
                req_headers["X-SAP-Language"] = sap_credentials["sap_language"]
        for attempt in range(2):
            try:
                res = await sap_client.call_tool(http_client, "set_active_server", payload, extra_headers=req_headers)
                if res.is_error:
                    msg = res.content[0].text if res.content else "Unknown error"
                    raise RuntimeError(f"Tool set_active_server mengembalikan error: {msg}")

                if res.content and res.content[0].text:
                    try:
                        data = json.loads(res.content[0].text)
                        if not data.get("success", True):
                            raise RuntimeError(f"MCP SAP menolak active server '{target_sap}': {data.get('message')}")
                    except (json.JSONDecodeError, TypeError):
                        pass

                self._active_sap_target = target_sap
                logger.info(f"SAP Active Server diset ke '{target_sap}' (overrides: {bool(sap_credentials)}): {[c.text for c in res.content]}")
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

    async def get_all_tools(self, server_filter: str = "all", allowed_connectors: Optional[set] = None) -> list[dict]:
        tools = []
        is_sql_mode = server_filter.startswith("sql:") or server_filter == "sql"
        is_sap_mode = server_filter.startswith("sap:") or server_filter == "sap"

        # Bila pengguna secara eksplisit memilih SQL, aktifkan SQL + RAG dan nonaktifkan SAP
        # agar model tidak keliru memanggil tool SAP.
        if is_sql_mode:
            is_sap = False
            is_sql = True
            is_rag = True
        elif is_sap_mode:
            is_sap = True
            is_sql = False
            is_rag = True
        else:
            is_sap = True
            is_sql = True
            is_rag = True

        # Terapkan pembatasan konektor dari access control bila ada
        is_email = True
        if allowed_connectors is not None:
            if "sap" not in allowed_connectors:
                is_sap = False
            if "sql" not in allowed_connectors:
                is_sql = False
            if "rag" not in allowed_connectors:
                is_rag = False
            if "email" not in allowed_connectors:
                is_email = False

        async with httpx.AsyncClient() as http_client:
            # SAP Tools
            if is_sap:
                try:
                    sap_client = self.get_client("sap")
                    sap_tools = await sap_client.list_tools(http_client)
                    for t in sap_tools:
                        cls = classify_gateway_tool(t.name)
                        if cls == "sap":
                            tools.append({"server": "sap", "tool": t})
                except Exception as e:
                    logger.error(f"Error fetching SAP tools: {e}")

            # RAG Tools — langsung dari client "rag" tanpa email
            if is_rag:
                try:
                    rag_client = self.get_client("rag")
                    rag_tools = await rag_client.list_tools(http_client)
                    for t in rag_tools:
                        cls = classify_gateway_tool(t.name)
                        # Lewati tool yang bukan domain RAG murni (ditangani client lain)
                        if cls != "rag":
                            continue
                        # Pangkas tool internal administratif gateway
                        if is_internal_rag_tool(t.name):
                            continue
                        tools.append({"server": "rag", "tool": t})
                except Exception as e:
                    logger.error(f"Error fetching RAG tools: {e}")

            # Email Tools — client "email" tersendiri (bukan menumpang RAG)
            if is_email:
                try:
                    email_client = self.get_client("email")
                    email_tools = await email_client.list_tools(http_client)
                    for t in email_tools:
                        cls = classify_gateway_tool(t.name)
                        if cls == "email":
                            tools.append({"server": "email", "tool": t})
                except Exception as e:
                    logger.warning(f"Error fetching Email tools (MCP Email offline or unavailable): {e}")

            # SQL Tools — terima tool bernamespace gateway (mcp-sql__*) maupun legacy (sql_*)
            if is_sql:
                try:
                    sql_client = self.get_client("sql")
                    sql_tools = await sql_client.list_tools(http_client)
                    for t in sql_tools:
                        cls = classify_gateway_tool(t.name)
                        if cls != "sql":
                            continue
                        # Lewati tool admin config yang tidak relevan untuk pengguna
                        if is_sql_admin_tool(t.name):
                            continue
                        tools.append({"server": "sql", "tool": t})
                except Exception as e:
                    logger.warning(f"Error fetching SQL tools (MCP SQL offline or unavailable): {e}")

            # Custom Dynamic MCP Servers Tools
            try:
                live_resources = await self.get_live_resources()
                custom_servers_map = {}
                for r in live_resources:
                    # Resource bawaan/aggregate adalah target di dalam Dashboard gateway,
                    # bukan custom MCP endpoint terpisah.
                    if r.get("kind") in ("sap", "sql", "rag", "email", "service"):
                        continue
                    srv_id = r.get("serverId") or r.get("server_id")
                    if not srv_id and ":" in r.get("resource_key", ""):
                        prefix = r["resource_key"].split(":", 1)[0]
                        if prefix not in ("sap", "rag", "sql", "email", "service"):
                            srv_id = prefix
                    if srv_id:
                        custom_servers_map[srv_id] = r.get("server_name") or r.get("label") or srv_id

                for cs_id, cs_name in custom_servers_map.items():
                    if allowed_connectors is not None and cs_id not in allowed_connectors:
                        continue
                    if server_filter not in ("all", cs_id) and not server_filter.startswith(f"{cs_id}:"):
                        continue
                    try:
                        cs_client = self.get_client(cs_id)
                        cs_tools = await cs_client.list_tools(http_client)
                        for t in cs_tools:
                            tools.append({"server": cs_id, "server_name": cs_name, "tool": t})
                    except Exception as e:
                        logger.warning(f"Error fetching tools from custom MCP '{cs_id}': {e}")
            except Exception as ex:
                logger.warning(f"Error listing custom MCP tools: {ex}")
        return tools

    async def call_tool(
        self,
        server_name: str,
        tool_name: str,
        arguments: dict,
        sap_target: str = None,
        sap_credentials: Optional[dict] = None,
    ) -> MCPCallResult:
        """Panggil satu tool MCP.

        Untuk server SAP/SQL, `sap_target` menyatakan sistem server mana yang dituju.
        `sap_credentials` dapat menyediakan kredensial per-user (sap_user, sap_password, sap_client).
        Penetapan target dan pemanggilan tool dilakukan di bawah satu lock agar
        request user lain tidak dapat menyisip di antaranya dan mengalihkan
        query ke sistem yang salah.
        """
        # Bersihkan meta-key yang lazim disisipkan LLM (seperti 'reason', 'comment', 'note')
        # yang ditolak ketat oleh interface PyRFC SAP ('field reason not found').
        final_args = arguments
        if server_name == "sap" and isinstance(arguments, dict):
            final_args = self._sanitize_sap_arguments(tool_name, arguments)

        extra_sap_headers = {}
        if server_name == "sap":
            if isinstance(final_args, dict) and sap_target and "resource_key" not in final_args:
                try:
                    import access_control
                    final_args["resource_key"] = access_control.canonical_resource_key(f"sap:{sap_target}")
                except Exception:
                    final_args["resource_key"] = sap_target if str(sap_target).startswith("sap:") else f"sap:{sap_target}"
            if sap_target:
                extra_sap_headers["X-SAP-Server"] = sap_target
            if sap_credentials:
                if sap_credentials.get("sap_user"):
                    extra_sap_headers["X-SAP-User"] = sap_credentials["sap_user"]
                if sap_credentials.get("sap_password"):
                    extra_sap_headers["X-SAP-Password"] = sap_credentials["sap_password"]
                if sap_credentials.get("sap_client"):
                    extra_sap_headers["X-SAP-Client"] = sap_credentials["sap_client"]
                if sap_credentials.get("sap_language"):
                    extra_sap_headers["X-SAP-Language"] = sap_credentials["sap_language"]

        if server_name == "sap" and sap_target:
            async with self._sap_lock:
                async with httpx.AsyncClient() as http_client:
                    ok = await self._set_active_sap_server_unlocked(
                        http_client,
                        sap_target,
                        sap_credentials=sap_credentials,
                        extra_headers=extra_sap_headers,
                    )
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
                    return await self._handle_sap_call(
                        http_client,
                        client,
                        tool_name,
                        final_args,
                        extra_headers=extra_sap_headers,
                    )

        async with httpx.AsyncClient() as http_client:
            client_target = server_name
            client = self.get_client(client_target)
            if server_name == "sap":
                return await self._handle_sap_call(
                    http_client,
                    client,
                    tool_name,
                    final_args,
                    extra_headers=extra_sap_headers,
                )
            if server_name == "sql":
                target = sap_target
                if not target:
                    try:
                        resources = await self.get_live_resources()
                        sql_res = [r for r in resources if r.get("kind") == "sql"]
                        if sql_res:
                            target = sql_res[0].get("resource_key") or sql_res[0].get("name")
                    except Exception as ex:
                        logger.warning(f"Gagal mendeteksi resource SQL default: {ex}")
                if target:
                    try:
                        await client.call_tool(http_client, "set_active_server", {"server_ref": target, "resource_key": target})
                    except Exception as ex:
                        logger.warning(f"Gagal mengatur active SQL server '{target}': {ex}")
                    if isinstance(final_args, dict):
                        if "server" not in final_args:
                            final_args["server"] = target
                        if "resource_key" not in final_args:
                            final_args["resource_key"] = target
            res = await client.call_tool(http_client, tool_name, final_args)

            if server_name == "sql" and res.content:
                for item in res.content:
                    txt = getattr(item, "text", "")
                    if "Password untuk server" in txt and "tidak ditemukan" in txt:
                        import re
                        srv_match = re.search(r'Password untuk server [\\"]*([^\\"]+)[\\"]* tidak ditemukan', txt)
                        srv_lbl = srv_match.group(1) if srv_match else "database"
                        env_match = re.search(r'env var [\\"]*([^\\"]+)[\\"]*', txt)
                        env_name = env_match.group(1) if env_match else f"SQL_PWD_{srv_lbl.upper().replace('-', '_')}"
                        item.text = (
                            f"⚠️ Koneksi Gagal: Password untuk server SQL '{srv_lbl}' belum dikonfigurasi di Gateway/Dashboard MCP. "
                            f"Silakan konfigurasikan credential di Dashboard MCP atau tambahkan environment variable '{env_name}'."
                        )
                        res.is_error = True
                    elif txt.strip().startswith('{"error":') or txt.strip().startswith('{\n  "error":'):
                        try:
                            err_data = json.loads(txt)
                            if "error" in err_data:
                                res.is_error = True
                        except Exception:
                            pass
            return res
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

    async def _handle_sap_call(
        self,
        http_client,
        client,
        tool_name: str,
        final_args: dict,
        extra_headers: Optional[dict] = None,
    ) -> MCPCallResult:
        """Eksekusi tool SAP dengan perlindungan Atomic Auto-Commit untuk BAPI mutasi."""
        res = await client.call_tool(http_client, tool_name, final_args, extra_headers=extra_headers)
        clean_tool = tool_name.split("__", 1)[-1] if "__" in tool_name else tool_name
        if clean_tool != "call_function" or res.is_error or not res.content:
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
                    }, extra_headers=extra_headers)
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
                    }, extra_headers=extra_headers)
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
        clean_tool = tool_name.split("__", 1)[-1] if "__" in tool_name else tool_name
        if clean_tool == "call_function" and "parameters" in cleaned and isinstance(cleaned["parameters"], dict):
            # Pastikan dict parameters bersih dari meta-keys
            cleaned["parameters"] = _clean(cleaned["parameters"])
        return cleaned

mcp_manager = MCPManager()