# MCP URL Registry, Per-User Token & Access Control Purge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace centralized MCP gateway routing with a local URL registry (name+url only), remove static-token fallbacks, add SAP bound-token generation via dashboard-mcp, enforce per-user SAP onboarding, and purge all local access-control UI/endpoints/logic.

**Architecture:** ai-assistant stores MCP server URLs locally (no tokens); every MCP request carries the user's OIDC Bearer from dashboard-mcp login. SAP credentials generate a bound-token via a new dashboard-mcp endpoint; token stored locally encrypted. Access control enforcement fully delegated to dashboard-mcp gateway; local RBAC code and UI deleted, tables retained.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy (backend), React / Tailwind CSS (frontend), PostgreSQL, Fernet encryption, httpx

**Spec:** `docs/superpowers/specs/2026-09-24-mcp-per-user-token-design.md`

## Global Constraints

- AGENTS.md §1: No auto-deploy, no push, commits local only on branch `new-integration`
- AGENTS.md §2: Never drop tables/schemas/data; vestigial columns and RBAC tables stay in DB
- AGENTS.md §3: `cd frontend && npm run build` MUST produce clean output
- AGENTS.md §5: All UI text via `useLanguage()` + `frontend/src/lib/i18n.js`
- AGENTS.md §6: Mobile-first responsive Tailwind CSS
- Ponytail: shortest diff wins; deletion > addition; fallback code marked `ponytail:` with upgrade path
- Test suite: `backend/venv/bin/pytest backend/tests/` MUST pass after each task

---

### Task 1: Purge Access Control — Backend

Remove `access_control.py` module, all `/api/admin/access/*` endpoints in `main.py`, all `access_control.*` call sites in `agent.py` and `main.py`, and the startup listener. Tables stay in DB.

**Files:**
- Delete: `backend/access_control.py` (~1300 lines)
- Modify: `backend/main.py` (lines 102, 146, 312, 486-487, 506, 546-548, 787-789, 1100, 1106-1107, 1122, 1394, 1408, 1590-1591, 1636-1637, and access endpoint block ~1500-1650)
- Modify: `backend/agent.py` (lines 10, 471, 500, 679, 911-919, 948-950, 976, 1181, 1671-1697, 1829-1952)
- Test: `backend/tests/test_access_control_purge.py`

**Interfaces:**
- Consumes: nothing new
- Produces: Clean backend with no `access_control` references; `save_my_sap_credential` and `test_sap_connection` no longer call `assert_can_use`; `get_mcp_servers` returns servers without RBAC filtering; `agent.py` tool calls proceed without `assert_can_use`/`allowed_connectors`/`log_audit` guards

- [ ] **Step 1: Write regression test confirming no access_control imports remain**

```python
# backend/tests/test_access_control_purge.py
"""Ensure access_control module is fully purged from runtime imports."""
import subprocess, pathlib

BACKEND = pathlib.Path(__file__).resolve().parent.parent

def test_no_access_control_imports():
    """No .py file under backend/ should import access_control."""
    result = subprocess.run(
        ["grep", "-rn", "import access_control", str(BACKEND)],
        capture_output=True, text=True
    )
    # Exclude this test file itself and __pycache__
    lines = [l for l in result.stdout.strip().splitlines()
             if "__pycache__" not in l and "test_access_control_purge" not in l]
    assert lines == [], f"Stale access_control imports:\n" + "\n".join(lines)

def test_no_access_control_module():
    """access_control.py should not exist."""
    assert not (BACKEND / "access_control.py").exists(), "access_control.py still exists"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
backend/venv/bin/pytest backend/tests/test_access_control_purge.py -v
```
Expected: FAIL — `access_control.py` exists, imports found.

- [ ] **Step 3: Delete `backend/access_control.py`**

```bash
rm backend/access_control.py
```

- [ ] **Step 4: Remove access_control references from `backend/main.py`**

Changes required:
1. **Line 102**: Delete `import access_control`.
2. **Line 146**: Delete `role_listener = access_control.start_role_change_listener()`.
3. **Line 312**: Delete `from access_control import normalize_roles` — replace any `normalize_roles(x)` call with inline: if `x` is a string, wrap in `[x]`; if list, use as-is.
4. **Lines 486-487** (`/api/me/sap-credentials/available-servers`): Replace `access_control.resolve_access(...)` and `access_control.normalize_roles(...)` calls — remove RBAC filtering, return all servers directly.
5. **Lines 506, 546-548** (`save_my_sap_credential`): Remove `access_control.is_access_control_enabled()` check and `access_control.assert_can_use(...)` block.
6. **Lines 787-789** (`test_sap_connection`): Remove same `assert_can_use` guard.
7. **Lines 1100, 1106-1107, 1122** (`get_mcp_servers`): Remove `access_control.sync_resources_from_mcp(...)` and `access_control.filter_servers_for_user(...)`. Return `raw` servers directly.
8. **Lines 1394, 1408**: Remove `access_control.invalidate_effective_roles_cache(username)`.
9. **Lines 1590-1637**: Remove `access_control.broadcast_access_change()` and `access_control.log_audit(...)` calls.
10. **Delete ALL `/api/admin/access/*` endpoints** (~lines 1500-1650): `get_admin_access_resources`, `sync_admin_access_resources`, `get_admin_access_roles`, `update_admin_access_roles`, `get_admin_user_access`, `update_admin_user_access`, `bulk_admin_user_access`, `get_admin_access_audit`, `toggle_admin_access_master`.

- [ ] **Step 5: Remove access_control references from `backend/agent.py`**

Changes required:
1. **Line 10**: Delete `import access_control`.
2. **Lines 471, 500, 679**: Replace `access_control.normalize_roles(user_role)` with inline `[user_role] if isinstance(user_role, str) else (user_role or ["user"])`.
3. **Lines 911-919**: Remove `access_control.assert_can_use(...)` and `access_control.allowed_connectors(...)` calls. Pass `allowed_connectors=None` (or remove param) to `get_all_tools()`.
4. **Lines 948-950, 976**: Remove `if access_control.is_access_control_enabled():` blocks and their `resolve_access`/`canonical_resource_key` calls.
5. **Lines 1181**: Remove `if access_control.is_access_control_enabled():` guard.
6. **Lines 1671-1697**: Remove all `access_control.is_access_control_enabled()` guards and `access_control.log_audit(...)` calls that block text tools. Let all tool calls through.
7. **Lines 1829-1952**: Remove all `access_control.is_access_control_enabled()` + `access_control.log_audit(...)` blocks.

- [ ] **Step 6: Run purge test + full suite**

```bash
backend/venv/bin/pytest backend/tests/test_access_control_purge.py -v
backend/venv/bin/pytest backend/tests/ -v
```
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat!: purge access_control module, endpoints, and all RBAC call sites from backend"
```

---

### Task 2: Purge Access Control — Frontend

Remove `AdminAccessControl.jsx`, its tab in `AdminDashboard.jsx`, API functions, and i18n keys.

**Files:**
- Delete: `frontend/src/components/AdminAccessControl.jsx` (2236 lines)
- Modify: `frontend/src/components/AdminDashboard.jsx` (tab definition ~697, render ~1376, ~1760-1765)
- Modify: `frontend/src/lib/api.js` (lines ~250-264)
- Modify: `frontend/src/lib/i18n.js` (keys `admin.tabAccess`)
- Test: `cd frontend && npm run build`

**Interfaces:**
- Consumes: Task 1 backend purge complete (no API to call)
- Produces: Clean frontend build with no access-control UI

- [ ] **Step 1: Delete `AdminAccessControl.jsx`**

```bash
rm frontend/src/components/AdminAccessControl.jsx
```

- [ ] **Step 2: Remove tab and render from `AdminDashboard.jsx`**

1. Remove `import AdminAccessControl` (or lazy import).
2. Remove tab object `{ id: 'access', icon: ShieldCheck, label: t('admin.tabAccess') }` (~line 697).
3. Remove `onClick={() => setActiveTab('access')}` reference (~line 1376).
4. Remove conditional render block `{activeTab === 'access' && (<AdminAccessControl .../>)}` (~lines 1760-1765).

- [ ] **Step 3: Remove API functions from `api.js`**

Delete these functions (lines ~250-264):
```
adminAccessResources
adminSyncAccessResources
adminAccessRoles
adminUpdateAccessRoles
adminUserAccess
adminUpdateUserAccess
adminBulkUserAccess
adminAccessAudit
adminToggleAccessMaster
```

- [ ] **Step 4: Remove i18n keys from `i18n.js`**

Delete `'admin.tabAccess'` entries from both EN and ID language blocks.

- [ ] **Step 5: Verify frontend build**

```bash
cd frontend && npm run build
```
Expected: Clean build, no missing import or reference errors.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat!: remove access control UI, API functions, and i18n keys from frontend"
```

---

### Task 3: MCP URL Registry — Backend

Simplify `list_mcp_servers` / `save_mcp_server` / `delete_mcp_server` to only use name+url+enabled. Un-410 admin MCP CRUD endpoints. Update `_get_client_config` to read URL from DB. Remove static token fallback from `get_client`.

**Files:**
- Modify: `backend/database.py` — `list_mcp_servers` (~840), `get_mcp_server` (~888), `save_mcp_server` (~929), `update_mcp_server` (~969), `delete_mcp_server` (~1010)
- Modify: `backend/mcp_manager.py` — `_get_client_config` (254), `get_client` (282)
- Modify: `backend/main.py` — un-410 admin MCP CRUD block (2235-2252)
- Modify: `backend/config.py` — mark `dashboard_mcp_api_token` as vestigial
- Test: `backend/tests/test_mcp_url_registry.py`

**Interfaces:**
- Consumes: Task 1 complete (no access_control calls remain)
- Produces:
  - `database.list_mcp_servers(enabled_only=False) -> list[dict]` returning `[{id, name, url, enabled, display_order}]`
  - `database.save_mcp_server(sid, name, url, enabled=True) -> dict`
  - `database.delete_mcp_server(sid) -> bool`
  - `mcp_manager._get_client_config(name) -> (url, {})` resolving from DB first, gateway fallback second
  - `mcp_manager.get_client(name) -> StreamableHttpClient` using only user OIDC token, no static fallback

- [ ] **Step 1: Write test for URL-only registry and no-static-token**

```python
# backend/tests/test_mcp_url_registry.py
"""MCP URL registry stores only name+url; get_client uses only user OIDC token."""

def test_list_mcp_servers_no_token_field():
    """list_mcp_servers result dicts must not contain auth_token."""
    from database import list_mcp_servers
    servers = list_mcp_servers()
    for s in servers:
        assert "auth_token" not in s, f"auth_token leaked in {s['name']}"

def test_get_client_no_static_fallback():
    """get_client must not reference dashboard_mcp_api_token."""
    import inspect, mcp_manager as mm
    source = inspect.getsource(mm.MCPManager.get_client)
    assert "dashboard_mcp_api_token" not in source, \
        "get_client still references static dashboard_mcp_api_token"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
backend/venv/bin/pytest backend/tests/test_mcp_url_registry.py -v
```
Expected: FAIL — `auth_token` present and `dashboard_mcp_api_token` referenced.

- [ ] **Step 3: Simplify `database.py` MCP server functions**

Update `list_mcp_servers` (~line 840):
- SELECT only `id, name, url, enabled, display_order` (drop `auth_token`, `headers`, `transport_type`, `description`, `icon`, `is_system` from query result).
- Return dicts with only those 5 fields.

Update `get_mcp_server` (~line 888):
- Same column reduction.

Update `save_mcp_server` (~line 929):
- Accept only `sid, name, url, enabled`. Ignore `auth_token`, `headers` params.
- INSERT/UPDATE only `id, name, url, enabled, display_order`.

Update `update_mcp_server` (~line 969):
- Accept only `name, url, enabled`. Drop `auth_token`, `headers` from SET clause.

Update `delete_mcp_server` (~line 1010):
- No change needed (already works on `id`).

- [ ] **Step 4: Update `mcp_manager.py:_get_client_config`**

Replace the method body:
```python
def _get_client_config(self, name: str) -> tuple[str, dict]:
    """Resolve MCP server URL: local DB first, gateway fallback."""
    from database import list_mcp_servers
    # Check local registry
    servers = list_mcp_servers(enabled_only=True)
    for s in servers:
        if s["id"] == name or s["name"] == name:
            return s["url"].rstrip("/"), {}
    # Fallback to gateway for unregistered connectors
    gateway_base = (settings.dashboard_mcp_gateway_url or "").rstrip("/")
    if not gateway_base:
        raise RuntimeError("No MCP URL found for '{}' and gateway not configured.".format(name))
    if name in ("sap", "rag", "sql", "email"):
        return gateway_base, {}
    return f"{gateway_base}/{name}", {}
```

- [ ] **Step 5: Simplify `mcp_manager.py:get_client` — remove static token fallback**

Replace the method body:
```python
def get_client(self, name: str) -> StreamableHttpClient:
    """Per-user MCP client authenticated with user's OIDC Bearer token."""
    from auth import get_dashboard_access_token
    access_token = get_dashboard_access_token()
    if not access_token:
        raise PermissionError("Sesi dashboard-mcp tidak ditemukan atau telah kedaluwarsa.")
    url, headers = self._get_client_config(name)
    gw_headers = dict(headers or {})
    gw_headers["Authorization"] = f"Bearer {access_token}"
    cache_key = (name, access_token)
    if cache_key not in self.clients or self.clients[cache_key].url != url:
        self.clients[cache_key] = StreamableHttpClient(name=name, url=url, headers=gw_headers)
    return self.clients[cache_key]
```

- [ ] **Step 6: Un-410 admin MCP CRUD endpoints in `main.py`**

Replace the 410-raising handlers (~lines 2235-2252) with working implementations:

```python
@app.post("/api/admin/mcp/servers")
async def create_admin_mcp_server_endpoint(req: CreateMcpServerRequest, admin: dict = Depends(require_superadmin)):
    result = database.save_mcp_server(sid=req.name.lower().replace(" ", "-"), name=req.name, url=req.url, enabled=getattr(req, "enabled", True))
    if not result:
        raise HTTPException(status_code=500, detail="Gagal menyimpan server MCP.")
    return {"success": True, "server": result}

@app.put("/api/admin/mcp/servers/{server_id}")
async def update_admin_mcp_server_endpoint(server_id: str, req: UpdateMcpServerRequest, admin: dict = Depends(require_superadmin)):
    result = database.update_mcp_server(server_id, name=getattr(req, "name", None), url=getattr(req, "url", None), enabled=getattr(req, "enabled", None))
    if not result:
        raise HTTPException(status_code=404, detail="Server MCP tidak ditemukan.")
    return {"success": True, "server": result}

@app.delete("/api/admin/mcp/servers/{server_id}")
async def delete_admin_mcp_server_endpoint(server_id: str, admin: dict = Depends(require_superadmin)):
    ok = database.delete_mcp_server(server_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Server MCP tidak ditemukan.")
    return {"success": True}
```

Remove the `/reset` endpoint entirely (dead code) and `_MCP_DEPRECATED_DETAIL` constant.

- [ ] **Step 7: Run tests**

```bash
backend/venv/bin/pytest backend/tests/test_mcp_url_registry.py backend/tests/ -v
```
Expected: ALL PASS.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: mcp url-only registry, remove static token fallback, un-410 admin CRUD"
```

---

### Task 4: MCP URL Registry — Frontend (`AdminMcpConfig.jsx`)

Rewrite `AdminMcpConfig.jsx` from informational notice to a working CRUD form for name+url+enabled.

**Files:**
- Rewrite: `frontend/src/components/AdminMcpConfig.jsx`
- Modify: `frontend/src/lib/api.js` — update admin MCP functions (remove token params, ensure `adminCreateMcpServer({name, url, enabled})`, `adminUpdateMcpServer(id, {name, url, enabled})`, `adminDeleteMcpServer(id)`)
- Modify: `frontend/src/lib/i18n.js` — add keys for MCP registry UI (`mcp.serverName`, `mcp.serverUrl`, `mcp.enabled`, `mcp.addServer`, `mcp.editServer`, `mcp.deleteConfirm`, `mcp.saved`, `mcp.deleted`)
- Test: `cd frontend && npm run build`

**Interfaces:**
- Consumes: Task 3 backend CRUD endpoints working
- Produces: Admin MCP tab shows server list (name, url, status) with add/edit/delete/test actions

- [ ] **Step 1: Update `api.js` MCP admin functions**

Replace existing admin MCP functions (~lines 275-281) with:
```javascript
adminMcpServers: () => apiFetch('/api/admin/mcp/servers'),
adminCreateMcpServer: (data) => apiFetch('/api/admin/mcp/servers', { method: 'POST', body: data }),
adminUpdateMcpServer: (id, data) => apiFetch(`/api/admin/mcp/servers/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
adminDeleteMcpServer: (id) => apiFetch(`/api/admin/mcp/servers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
adminTestMcpConnection: (data) => apiFetch('/api/admin/mcp/test', { method: 'POST', body: data }),
```

- [ ] **Step 2: Add i18n keys**

Add to both EN and ID blocks in `frontend/src/lib/i18n.js`:
```javascript
// EN
'mcp.serverName': 'Server Name',
'mcp.serverUrl': 'Server URL',
'mcp.enabled': 'Enabled',
'mcp.addServer': 'Add MCP Server',
'mcp.editServer': 'Edit MCP Server',
'mcp.deleteConfirm': 'Delete this MCP server?',
'mcp.saved': 'MCP server saved.',
'mcp.deleted': 'MCP server deleted.',
'mcp.testSuccess': 'Connection successful.',
'mcp.testFailed': 'Connection failed.',

// ID
'mcp.serverName': 'Nama Server',
'mcp.serverUrl': 'URL Server',
'mcp.enabled': 'Aktif',
'mcp.addServer': 'Tambah Server MCP',
'mcp.editServer': 'Edit Server MCP',
'mcp.deleteConfirm': 'Hapus server MCP ini?',
'mcp.saved': 'Server MCP disimpan.',
'mcp.deleted': 'Server MCP dihapus.',
'mcp.testSuccess': 'Koneksi berhasil.',
'mcp.testFailed': 'Koneksi gagal.',
```

- [ ] **Step 3: Rewrite `AdminMcpConfig.jsx`**

Replace entire file with a CRUD component:
- State: `servers[]`, `form: {name, url, enabled}`, `editingId`, `loading`, `testResult`
- On mount: `api.adminMcpServers()` → populate `servers`.
- Render: Table/card list of servers (name, url, enabled badge, action buttons: Edit/Delete/Test).
- Add/Edit modal: 2 text inputs (Name, URL) + checkbox (Enabled). Submit → `adminCreateMcpServer` or `adminUpdateMcpServer`.
- Delete: confirm dialog → `adminDeleteMcpServer`.
- Test: button per-server → `adminTestMcpConnection({server_id: id})` → show toast success/fail.
- No token/auth_token/secret input anywhere.
- Use `useLanguage()` for all labels.
- Tailwind responsive (mobile-first per AGENTS.md §6).

- [ ] **Step 4: Verify frontend build**

```bash
cd frontend && npm run build
```
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: rewrite AdminMcpConfig as URL-only CRUD (name, url, enabled)"
```

---

### Task 5: SAP Bound-Token — Backend

Add `user_sap_tokens` table, `POST /api/me/sap-credentials/bind-token` endpoint, and onboarding check in `agent.py`.

**Files:**
- Modify: `backend/database.py` — add table creation in init, CRUD for `user_sap_tokens`
- Modify: `backend/migrations.py` — new migration `_m0019_user_sap_tokens()` (or next available number)
- Modify: `backend/main.py` — new endpoint `POST /api/me/sap-credentials/bind-token`
- Modify: `backend/agent.py` — pre-tool SAP onboarding check
- Modify: `backend/mcp_manager.py` — send `X-SAP-Token` header when bound token available
- Test: `backend/tests/test_sap_token_binding.py`

**Interfaces:**
- Consumes: Task 1 (no access_control refs), existing `get_user_sap_credential`, `encrypt_fernet`/`decrypt_fernet`
- Produces:
  - `database.save_user_sap_token(username, target, token, expires_at) -> bool`
  - `database.get_user_sap_token(username, target) -> Optional[dict]` returning `{token, expires_at}` (decrypted)
  - `database.delete_user_sap_token(username, target) -> bool`
  - `POST /api/me/sap-credentials/bind-token {target}` → calls dashboard-mcp → stores token
  - `agent.py` raises structured `NEED_SAP_CREDENTIAL` when user lacks credential for SAP target

- [ ] **Step 1: Write test for token binding flow**

```python
# backend/tests/test_sap_token_binding.py
"""SAP bound-token table exists and CRUD works."""
import pathlib

def test_user_sap_tokens_table_in_migrations():
    """Migration file must reference user_sap_tokens table creation."""
    src = pathlib.Path(__file__).resolve().parent.parent / "migrations.py"
    assert "user_sap_tokens" in src.read_text(), "user_sap_tokens migration missing"

def test_save_and_get_sap_token():
    """Round-trip: save token encrypted, retrieve decrypted."""
    from database import save_user_sap_token, get_user_sap_token, delete_user_sap_token
    from datetime import datetime, timezone, timedelta
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    assert save_user_sap_token("test-tok-user", "dev", "tok_abc123", expires)
    result = get_user_sap_token("test-tok-user", "dev")
    assert result is not None
    assert result["token"] == "tok_abc123"
    # cleanup
    delete_user_sap_token("test-tok-user", "dev")

def test_get_client_sends_sap_token_header():
    """mcp_manager must reference X-SAP-Token header."""
    import inspect, mcp_manager as mm
    # Check the SAP credential forwarding section
    src = inspect.getsource(mm)
    assert "X-SAP-Token" in src, "mcp_manager must send X-SAP-Token when bound token available"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
backend/venv/bin/pytest backend/tests/test_sap_token_binding.py -v
```
Expected: FAIL — no `user_sap_tokens` table, no functions, no header.

- [ ] **Step 3: Add migration `_m0019_user_sap_tokens`**

In `backend/migrations.py`, add new migration (find next available number):
```python
def _m0019_user_sap_tokens(conn):
    """Per-user SAP bound-token storage (token from dashboard-mcp)."""
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant_dev.user_sap_tokens (
            username VARCHAR(50) NOT NULL,
            target VARCHAR(50) NOT NULL,
            encrypted_token TEXT NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (username, target)
        )
    """))
    conn.commit()
```
Register in migration list.

- [ ] **Step 4: Add CRUD functions in `database.py`**

```python
def save_user_sap_token(username: str, target: str, token: str, expires_at=None) -> bool:
    enc = encrypt_fernet(token)
    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text("""
            INSERT INTO ai_assistant_dev.user_sap_tokens (username, target, encrypted_token, expires_at, updated_at)
            VALUES (:u, :t, :e, :exp, CURRENT_TIMESTAMP)
            ON CONFLICT (username, target)
            DO UPDATE SET encrypted_token = :e, expires_at = :exp, updated_at = CURRENT_TIMESTAMP
        """), {"u": username, "t": target, "e": enc, "exp": expires_at})
        conn.commit()
    return True

def get_user_sap_token(username: str, target: str) -> Optional[Dict[str, Any]]:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT encrypted_token, expires_at FROM ai_assistant_dev.user_sap_tokens
            WHERE username = :u AND target = :t
        """), {"u": username, "t": target}).fetchone()
    if not row:
        return None
    token = decrypt_fernet(row.encrypted_token)
    if not token:
        return None
    return {"token": token, "expires_at": row.expires_at}

def delete_user_sap_token(username: str, target: str) -> bool:
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(text("""
            DELETE FROM ai_assistant_dev.user_sap_tokens WHERE username = :u AND target = :t
        """), {"u": username, "t": target})
        conn.commit()
    return result.rowcount > 0
```

- [ ] **Step 5: Add `POST /api/me/sap-credentials/bind-token` endpoint in `main.py`**

```python
class BindSapTokenRequest(BaseModel):
    target: str

@app.post("/api/me/sap-credentials/bind-token")
async def bind_sap_token(req: BindSapTokenRequest, user: dict = Depends(get_current_user)):
    """Generate a bound SAP token via dashboard-mcp and store it locally."""
    from database import get_user_sap_credential, save_user_sap_token
    from auth import get_dashboard_access_token
    username = user["username"]
    target = (req.target or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="Target SAP wajib diisi.")
    cred = get_user_sap_credential(username, target)
    if not cred:
        raise HTTPException(status_code=404, detail=f"Kredensial SAP untuk '{target}' tidak ditemukan. Simpan kredensial terlebih dahulu.")
    access_token = get_dashboard_access_token()
    if not access_token:
        raise HTTPException(status_code=401, detail="Sesi dashboard-mcp tidak tersedia.")
    base = (settings.dashboard_mcp_url or settings.dashboard_oidc_issuer or "").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{base}/v1/integration/sap-tokens",
                json={"target": target, "sap_user": cred["sap_user"],
                      "sap_password": cred["sap_password"], "sap_client": cred.get("sap_client", "100")},
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except httpx.HTTPError as e:
        logger.error(f"dashboard-mcp unreachable for sap-token bind: {e}")
        raise HTTPException(status_code=502, detail="Layanan token SAP tidak tersedia.")
    if r.status_code in (404, 501):
        # ponytail: dashboard-mcp endpoint not yet implemented; credential saved, token not bound
        logger.warning(f"dashboard-mcp /v1/integration/sap-tokens returned {r.status_code}; fallback to legacy X-SAP headers")
        return {"success": True, "token_bound": False, "message": "Kredensial disimpan. Token binding belum tersedia di dashboard."}
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    data = r.json()
    from datetime import datetime, timezone, timedelta
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=data.get("expiresIn", 86400))
    save_user_sap_token(username, target, data["token"], expires_at)
    return {"success": True, "token_bound": True, "expires_at": expires_at.isoformat()}
```

- [ ] **Step 6: Update `mcp_manager.py` SAP credential forwarding**

In the section that sets `X-SAP-User/Password/Client` headers (~lines 676-695), add token check first:
```python
# Before sending legacy X-SAP-* headers, check for bound token
from database import get_user_sap_token
from datetime import datetime, timezone
tok = get_user_sap_token(username, target)
if tok and tok.get("token") and (not tok.get("expires_at") or tok["expires_at"] > datetime.now(timezone.utc)):
    extra_headers["X-SAP-Token"] = tok["token"]
else:
    # ponytail: fallback to plaintext credentials until dashboard-mcp sap-token endpoint ships
    cred = get_user_sap_credential(username, target)
    if cred:
        extra_headers["X-SAP-User"] = cred["sap_user"]
        extra_headers["X-SAP-Password"] = cred["sap_password"]
        extra_headers["X-SAP-Client"] = cred.get("sap_client", "100")
```

- [ ] **Step 7: Add onboarding check in `agent.py`**

Before SAP tool invocation (where `assert_can_use` was removed in Task 1), add:
```python
from database import get_user_sap_credential, get_user_sap_token
cred = get_user_sap_credential(username, target_srv)
tok = get_user_sap_token(username, target_srv)
if not cred and not tok:
    # User has neither credential nor token for this SAP target
    raise HTTPException(
        status_code=428,  # Precondition Required
        detail=json.dumps({"code": "NEED_SAP_CREDENTIAL", "target": target_srv,
                           "message": t("sap.bindRequired")})
    )
```

- [ ] **Step 8: Run tests**

```bash
backend/venv/bin/pytest backend/tests/test_sap_token_binding.py backend/tests/ -v
```
Expected: ALL PASS.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: sap bound-token via dashboard-mcp with fallback and onboarding guard"
```

---

### Task 6: SAP Bound-Token — Frontend & i18n

Wire bind-token call into SettingsModal SAP flow; add toast/redirect for `NEED_SAP_CREDENTIAL`; add i18n keys.

**Files:**
- Modify: `frontend/src/components/SettingsModal.jsx` (~lines 550-785 SAP form)
- Modify: `frontend/src/components/ChatLayout.jsx` (error handler for `NEED_SAP_CREDENTIAL`)
- Modify: `frontend/src/lib/api.js` — add `bindSapToken` function
- Modify: `frontend/src/lib/i18n.js` — add SAP binding i18n keys
- Test: `cd frontend && npm run build`

**Interfaces:**
- Consumes: Task 5 `POST /api/me/sap-credentials/bind-token` endpoint
- Produces: After saving SAP credential, frontend auto-calls bind-token; chat errors with `NEED_SAP_CREDENTIAL` show toast with settings link

- [ ] **Step 1: Add API function in `api.js`**

```javascript
bindSapToken: (target) => apiFetch('/api/me/sap-credentials/bind-token', { method: 'POST', body: { target } }),
```

- [ ] **Step 2: Add i18n keys**

```javascript
// EN
'sap.bindRequired': 'SAP credentials required. Go to Settings > SAP Credentials to set up your account.',
'sap.tokenBound': 'SAP token successfully bound for {target}.',
'sap.tokenNotAvailable': 'Token binding not yet available. Credentials saved locally.',
'sap.bindingToken': 'Binding SAP token...',

// ID
'sap.bindRequired': 'Kredensial SAP diperlukan. Buka Pengaturan > Kredensial SAP untuk mengatur akun Anda.',
'sap.tokenBound': 'Token SAP berhasil diikat untuk {target}.',
'sap.tokenNotAvailable': 'Token binding belum tersedia. Kredensial disimpan secara lokal.',
'sap.bindingToken': 'Mengikat token SAP...',
```

- [ ] **Step 3: Wire bind-token into `SettingsModal.jsx` save flow**

After successful `api.saveMySapCredential(...)` call in the save handler:
```javascript
// After credential saved successfully, attempt token binding
try {
  const bindResult = await api.bindSapToken(sapTarget);
  if (bindResult.token_bound) {
    showToast(t('sap.tokenBound').replace('{target}', sapTarget), 'success');
  } else {
    showToast(t('sap.tokenNotAvailable'), 'info');
  }
} catch (bindErr) {
  console.warn('Token binding failed, credentials saved:', bindErr);
  showToast(t('sap.tokenNotAvailable'), 'info');
}
```

- [ ] **Step 4: Handle `NEED_SAP_CREDENTIAL` in `ChatLayout.jsx`**

In the chat error handler (where API errors from agent are caught), add:
```javascript
if (error?.code === 'NEED_SAP_CREDENTIAL' || error?.detail?.includes?.('NEED_SAP_CREDENTIAL')) {
  const parsed = typeof error.detail === 'string' ? JSON.parse(error.detail) : error;
  showToast(parsed.message || t('sap.bindRequired'), 'warning', {
    action: { label: t('settings.title'), onClick: () => openSettings('sap') }
  });
  return; // Don't show generic error
}
```

- [ ] **Step 5: Verify frontend build**

```bash
cd frontend && npm run build
```
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: sap token binding UI, NEED_SAP_CREDENTIAL error handling, i18n"
```

---

### Task 7: Final Verification & Cleanup

Smoke-test full flow end-to-end, clean up dead code, ensure all tests pass.

**Files:**
- Modify: `backend/config.py` — add comment marking `dashboard_mcp_api_token` as vestigial
- Delete: dead `_MCP_DEPRECATED_DETAIL` constant if still in `main.py`
- Test: full suite + manual smoke

**Interfaces:**
- Consumes: Tasks 1-6 complete
- Produces: Verified working system

- [ ] **Step 1: Run full backend test suite**

```bash
backend/venv/bin/pytest backend/tests/ -v
```
Expected: ALL PASS.

- [ ] **Step 2: Run frontend build**

```bash
cd frontend && npm run build
```
Expected: Clean.

- [ ] **Step 3: Grep for stale references**

```bash
grep -rn "access_control\|AdminAccessControl\|dashboard_mcp_api_token" backend/*.py frontend/src/ --include="*.py" --include="*.jsx" --include="*.js" | grep -v __pycache__ | grep -v node_modules | grep -v "\.pyc" | grep -v "ponytail:\|vestigial\|# mark"
```
Expected: No stale active references (only comments/vestigial markers).

- [ ] **Step 4: Manual smoke test**

1. Rebuild & restart containers: `docker compose up -d --build`
2. Login: `POST /api/auth/login {"username":"test-user","password":"password"}` → 200 + cookie
3. Admin MCP: `GET /api/admin/mcp/servers` with superadmin → server list (name+url only)
4. Verify access tab gone: Load admin dashboard, confirm no 'Access Control' tab
5. SAP credential save + bind: `POST /api/me/sap-credentials` → `POST /api/me/sap-credentials/bind-token` → confirm fallback behavior (dashboard-mcp endpoint likely 404, which is expected)

- [ ] **Step 5: Mark `dashboard_mcp_api_token` as vestigial in config.py**

```python
# ponytail: vestigial — static MCP token no longer used at runtime; remove when env vars cleaned up
dashboard_mcp_api_token: str = os.getenv("DASHBOARD_MCP_API_TOKEN", "")
```

- [ ] **Step 6: Final commit**

```bash
git add -A && git commit -m "chore: final cleanup, smoke verification, mark vestigial config"
```
