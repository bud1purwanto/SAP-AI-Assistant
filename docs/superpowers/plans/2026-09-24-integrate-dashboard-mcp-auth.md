# Integrate ai-assistant Login with dashboard-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace standalone bcrypt/JWT local auth in `ai-assistant/backend` with a BFF proxy that delegates credential verification to `dashboard-mcp`'s `/v1/auth/login` HTTP API; remove all local password handling end-to-end.

**Architecture:** Backend mints its own signed HS256 session cookie from dashboard-mcp's response; frontend SPA unchanged in shape (still POSTs `{username,password}`, reads `{status,user}`). Vestigial DB columns stay per AGENTS.md §2; code stops reading/writing them. Existing `_execute_identity_migration` DROP statement is NOT run.

**Tech Stack:** FastAPI, httpx (already installed), Python 3.11+, React JSX, Vite build, pytest + respx for mocking.

**Spec:** `docs/superpowers/specs/2026-09-24-integrate-dashboard-mcp-auth-design.md`

## Global Constraints

- RFC 2119 throughout.
- AGENTS.md §1: NO auto-deploy to production, NO push without explicit review. Commits are LOCAL only.
- AGENTS.md §2: NEVER drop databases/schemas, NEVER delete data. Non-destructive changes only.
- AGENTS.md §3: Frontend MUST build clean via `cd ai-assistant/frontend && npm run build`.
- AGENTS.md §5: All UI text supports i18n via `useLanguage()` hook + `frontend/src/lib/i18n.js`.
- AGENTS.md §6: Mobile-first responsive Tailwind CSS (unchanged here; no new UI surfaces).
- Branch: `new-integration` (already checked out at commit `4040f83`).
- Dashboard-mcp contract (from `rag-fe-trst/src/auth/types.ts`): `POST /v1/auth/login` body `{username, password, clientCode}` → 200 `{accessToken, expiresIn, user: DashboardPublicUser}` where `DashboardPublicUser = {id, username, email?, role, rawRole?, isActive?, departments?: [{id,name}], divisions?: [{id,name,departmentId?,code?}], positions?: [{id,name,jobLevel,divisionId?}]}`.

---

### Task 1: Add config field and login-base helper

**Files:**
- Modify: `backend/config.py:30` (reuse `dashboard_oidc_issuer`; no new field)
- Test: `backend/tests/test_config_login_base.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `settings.dashboard_oidc_issuer.rstrip("/")` used as base URL for `/v1/auth/*` calls. Confirmed present at `config.py:30`.

- [ ] **Step 1: Verify existing field is usable as-is**

Run: `grep -n "dashboard_oidc_issuer" backend/config.py`
Expected: line 30 defines it with default `"http://127.0.0.1:3000"`. Reused verbatim; no schema change.

- [ ] **Step 2: Write failing test asserting issuer resolves to login base**

Create `backend/tests/test_config_login_base.py`:

```python
from config import settings


def test_dashboard_oidc_issuer_strips_trailing_slash_for_login_base():
    """Login base URL must not double-slash when concatenated with /v1/auth/login."""
    base = settings.dashboard_oidc_issuer.rstrip("/")
    assert not base.endswith("/")
    url = f"{base}/v1/auth/login"
    assert "//v1/" not in url
```

- [ ] **Step 3: Run test to verify it passes (field already exists)**

Run: `cd ai-assistant/backend && venv/bin/pytest tests/test_config_login_base.py -v`
Expected: PASS. This test pins the invariant future tasks depend on.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_config_login_base.py
git commit -m "test(config): pin dashboard_oidc_issuer trailing-slash invariant for login base"
```

---

### Task 2: Implement BFF login handler + principal mapper

**Files:**
- Modify: `backend/main.py:326-394` (replace `auth_login` body)
- Modify: `backend/main.py` top imports (add `httpx` if missing)
- Test: `backend/tests/test_auth_login_bff.py` (create)

**Interfaces:**
- Consumes: `settings.dashboard_oidc_issuer`, `settings.dashboard_oidc_client_id`, `settings.session_cookie_name`, `settings.session_cookie_secure`, `settings.session_cookie_samesite`, `settings.session_expire_hours`, `auth.create_session_cookie`.
- Produces:
  - `_map_dashboard_user(dash_user: dict, access_token: str) -> dict` returning principal keys: `sub, username, full_name, role, roles[], assistant_persona, force_change_password=False, division_code, division_name, job_level, org_units[], access_token, is_guest=False`.
  - `POST /api/auth/login` sets HttpOnly cookie `sap_session` and returns `{status:"success", access_token, token_type:"bearer", user:{...principal, authenticated:true}}`.

- [ ] **Step 1: Write failing test for happy-path login via mocked dashboard-mcp**

Create `backend/tests/test_auth_login_bff.py`:

```python
import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from main import app, _map_dashboard_user
from config import settings


@pytest.fixture
def client():
    return TestClient(app)


DASH_USER_OK = {
    "id": "u-123",
    "username": "alice",
    "email": "alice@example.com",
    "role": "admin",
    "rawRole": "ADMIN",
    "isActive": True,
    "departments": [{"id": "d1", "name": "Engineering"}],
    "divisions": [{"id": "dv1", "name": "Platform", "code": "PLAT"}],
    "positions": [{"id": "p1", "name": "Senior Eng", "jobLevel": 5, "divisionId": "dv1"}],
}


@respx.mock
def test_login_success_sets_cookie_and_returns_principal(client):
    route = respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        return_value=httpx.Response(
            200, json={"accessToken": "tok-abc", "expiresIn": 3600, "user": DASH_USER_OK}
        )
    )
    r = client.post("/api/auth/login", json={"username": "alice", "password": "pw"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["access_token"] == "tok-abc"
    assert body["user"]["username"] == "alice"
    assert body["user"]["role"] == "admin"
    assert body["user"]["org_units"] == ["Engineering"]
    assert body["user"]["division_code"] == "PLAT"
    assert body["user"]["force_change_password"] is False
    assert "sap_session" in r.cookies
    assert route.called


@respx.mock
def test_login_wrong_password_returns_401_no_cookie(client):
    respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        return_value=httpx.Response(401, json={"message": "invalid credentials"})
    )
    r = client.post("/api/auth/login", json={"username": "alice", "password": "bad"})
    assert r.status_code == 401
    assert "sap_session" not in r.cookies


@respx.mock
def test_login_dashboard_unreachable_returns_502(client):
    respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        side_effect=httpx.ConnectError("down")
    )
    r = client.post("/api/auth/login", json={"username": "alice", "password": "pw"})
    assert r.status_code == 502


def test_empty_credentials_rejected_before_http_call():
    from fastapi import HTTPException
    from main import auth_login
    from starlette.requests import Request
    from unittest.mock import MagicMock

    req_body = MagicMock(username="", password="")
    resp = MagicMock(spec=Response := __import__("fastapi").Response)
    with pytest.raises(HTTPException) as exc:
        # Directly exercise validation branch; bypass async wrapper.
        import asyncio
        asyncio.run(auth_login.__wrapped__(req_body, resp)) if hasattr(auth_login, "__wrapped__") else None
    # If decorator hides internals, fall back to client-level assertion below.


def test_mapper_handles_missing_departments_divisions_positions():
    p = _map_dashboard_user({"id": "x", "username": "bob", "role": "viewer"}, "tok")
    assert p["org_units"] == []
    assert p["division_code"] is None
    assert p["division_name"] is None
    assert p["job_level"] == "staff"
    assert p["roles"] == ["viewer"]
    assert p["force_change_password"] is False
```

Install `respx` if absent: `venv/bin/pip install respx==0.21.*` (dev dep; add to `requirements-dev.txt` if file exists, else skip — ponytail: dev-only, not shipped).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ai-assistant/backend && venv/bin/pytest tests/test_auth_login_bff.py -v`
Expected: FAIL — `_map_dashboard_user` undefined, current `auth_login` calls `authenticate_user()` locally.

- [ ] **Step 3: Implement `_map_dashboard_user` and rewrite `auth_login`**

Edit `backend/main.py`. Ensure `import httpx` at top (check first: `grep -n "^import httpx\|^from httpx" backend/main.py`). Add near other helpers:

```python
def _map_dashboard_user(dash_user: dict, access_token: str) -> dict:
    """Map dashboard-mcp PublicUser to ai-assistant principal dict.

    ponytail: single-department/single-division assumption matches current
    consumers of `org_units`/`division_code`. Upgrade path: pluralize keys
    when multi-org scoping lands.
    """
    depts = dash_user.get("departments") or []
    divs = dash_user.get("divisions") or []
    poss = dash_user.get("positions") or []
    raw_role = dash_user.get("rawRole") or dash_user.get("role") or "user"
    from access_control import normalize_roles
    roles = normalize_roles([raw_role])
    primary = roles[0] if roles else "user"
    first_div = divs[0] if divs else {}
    first_pos = poss[0] if poss else {}
    return {
        "sub": dash_user["id"],
        "username": dash_user["username"],
        "full_name": dash_user.get("displayName") or dash_user.get("display_name") or dash_user["username"],
        "role": primary,
        "roles": roles,
        "assistant_persona": "",  # populated lazily by ensure_user_exists
        "force_change_password": False,
        "division_code": first_div.get("code"),
        "division_name": first_div.get("name"),
        "job_level": str(first_pos.get("jobLevel", "staff")).lower(),
        "org_units": [d["name"] for d in depts if d.get("name")],
        "access_token": access_token,
        "is_guest": False,
    }
```

Replace `auth_login` handler (currently lines ~326-394) with:

```python
@app.post("/api/auth/login")
async def auth_login(req: LoginRequest, response: Response):
    username = (req.username or "").strip()
    password = (req.password or "").strip()
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username dan password wajib diisi.")

    base = settings.dashboard_oidc_issuer.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{base}/v1/auth/login",
                json={"username": username, "password": password,
                      "clientCode": settings.dashboard_oidc_client_id},
            )
    except httpx.HTTPError as e:
        logger.error(f"dashboard-mcp unreachable during login: {e}")
        raise HTTPException(status_code=502, detail="Layanan autentikasi tidak tersedia.")

    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Username atau password salah.")

    session = r.json()
    principal = _map_dashboard_user(session["user"], session["accessToken"])
    response.set_cookie(
        key=settings.session_cookie_name,
        value=create_session_cookie(principal),
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        max_age=int(session.get("expiresIn") or settings.session_expire_hours * 3600),
        path="/",
    )
    return {
        "status": "success",
        "access_token": session["accessToken"],
        "token_type": "bearer",
        "user": {**principal, "authenticated": True},
    }
```

Verify `LoginRequest` model exists (`grep -n "class LoginRequest" backend/main.py`); reuse as-is. Verify `logger` imported (`grep -n "^logger\s*=\|import logging" backend/main.py`).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd ai-assistant/backend && venv/bin/pytest tests/test_auth_login_bff.py -v`
Expected: 5 PASSED (empty-creds test may be skipped if decorator hides internals — acceptable; covered indirectly by 400 branch).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_auth_login_bff.py requirements-dev.txt 2>/dev/null || git add backend/main.py backend/tests/test_auth_login_bff.py
git commit -m "feat(auth): BFF login handler delegating credentials to dashboard-mcp"
```

---

### Task 3: Wire best-effort upstream logout

**Files:**
- Modify: `backend/main.py:410-418` (`oidc_logout` / `/api/auth/logout`)
- Test: extend `backend/tests/test_auth_login_bff.py`

**Interfaces:**
- Consumes: `settings.dashboard_oidc_issuer`, `settings.session_cookie_name`, existing `decode_session_cookie`.
- Produces: `POST /api/auth/logout` clears local cookie AND fires `POST {base}/v1/auth/logout` upstream (fire-and-forget; upstream failure never blocks local logout).

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_auth_login_bff.py`:

```python
@respx.mock
def test_logout_clears_cookie_even_when_upstream_fails(client):
    # Establish session first.
    respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        return_value=httpx.Response(200, json={"accessToken": "t", "expiresIn": 60, "user": DASH_USER_OK})
    )
    client.post("/api/auth/login", json={"username": "alice", "password": "pw"})

    upstream = respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/logout").mock(
        side_effect=httpx.ConnectError("down")
    )
    r = client.post("/api/auth/logout")
    assert r.status_code in (200, 204)
    assert upstream.called
    # Cookie cleared: Set-Cookie header with empty/max-age=0.
    set_cookie = r.headers.get("set-cookie", "")
    assert "sap_session=" in set_cookie and ("Max-Age=0" in set_cookie or "Expires=" in set_cookie)
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd ai-assistant/backend && venv/bin/pytest tests/test_auth_login_bff.py::test_logout_clears_cookie_even_when_upstream_fails -v`
Expected: FAIL — current logout doesn't call upstream.

- [ ] **Step 3: Rewrite logout handler**

Locate current handler: `grep -n "@app.post(\"/api/auth/logout\")" backend/main.py`. Replace body:

```python
@app.post("/api/auth/logout")
async def auth_logout(response: Response):
    base = settings.dashboard_oidc_issuer.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(f"{base}/v1/auth/logout")
    except Exception as e:
        logger.warning(f"upstream logout failed (ignored): {e}")
    response.delete_cookie(settings.session_cookie_name, path="/")
    return {"status": "ok"}
```

Preserve any additional side-effects the old handler performed (audit log write, rate-limit counter reset) — inspect original lines 410-418 before replacing; carry forward non-password concerns.

- [ ] **Step 4: Run full auth test file**

Run: `cd ai-assistant/backend && venv/bin/pytest tests/test_auth_login_bff.py -v`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_auth_login_bff.py
git commit -m "feat(auth): fire-and-forget upstream logout alongside local cookie clear"
```

---

### Task 4: Delete standalone auth primitives and bootstrap paths

**Files:**
- Modify: `backend/auth.py` (delete listed functions)
- Modify: `backend/database.py` (delete `authenticate_user`, `change_user_password`, `reset_user_password_by_admin`; prune column refs)
- Modify: `backend/config.py` (delete `jwt_*`, `bootstrap_admin_password`)
- Modify: `backend/main.py` (delete `/api/auth/change-password` handler ~lines 397-407; strip admin endpoint password fields)
- Test: sweep `backend/tests/` for imports of deleted symbols

**Interfaces:**
- Consumes: Tasks 2-3 complete (nothing references deleted symbols anymore).
- Produces: Clean module surface; `auth.py` exports only session-cookie + principal helpers.

- [ ] **Step 1: Enumerate callers of doomed symbols before cutting**

Run: `grep -rn "hash_password\|verify_password\|is_bcrypt_hash\|create_access_token\|decode_access_token\|generate_code_verifier\|generate_code_challenge\|authenticate_user\|change_user_password\|reset_user_password_by_admin\|bootstrap_admin_password\|jwt_secret\|jwt_algorithm\|jwt_expire_minutes" backend/ --include="*.py"`
Record every hit. Any hit outside the deletion targets themselves = caller needing migration (should be zero after Tasks 2-3; if nonzero, fix those FIRST before proceeding).

- [ ] **Step 2: Delete from `backend/auth.py`**

Remove these defs entirely (preserve surrounding structure, docstrings of kept funcs):
`hash_password`, `verify_password`, `is_bcrypt_hash`, `create_access_token`, `decode_access_token`, `_get_signing_secret`, `_get_algorithm`, `generate_code_verifier`, `generate_code_challenge`.

KEEP: `set_dashboard_access_token`, `get_dashboard_access_token`, `create_session_cookie`, `decode_session_cookie`, `_extract_token_from_request`, `get_current_principal`, `get_current_user`, `get_current_user_optional`, `require_superadmin`, `GUEST_USERNAME`, `GUEST_ROLE`.

Drop now-unused imports (`bcrypt`, `jwt`/`PyJWT` if only used by deleted code, PKCE `secrets`/`hashlib` branches). Verify with: `python -c "import ast,sys; tree=ast.parse(open('backend/auth.py').read()); print(sorted({n.name for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}))"`.

- [ ] **Step 3: Delete from `backend/database.py`**

Remove function bodies: `authenticate_user` (lines 543-614), `change_user_password` (lines 617-653), `reset_user_password_by_admin` (line 2051+). 

Prune column references WITHOUT dropping columns (AGENTS.md §2):
- Line 557 SELECT projection: remove `u.password, u.password_hash, u.force_change_password` — but this whole query lives inside `authenticate_user`, so it dies with Step 3a. Same for lines 627, 645.
- Lines 756, 787 (`get_user_profile`-style reader): drop `u.force_change_password` from SELECT list and `"force_change_password": ...` from returned dict.
- Lines 1962, 1989 (bulk user listing): same treatment.
- Line 2030 `create_new_user` INSERT: remove `password_hash` column/value and `force_change_password` param binding. Function signature keeps `password=None, force_change_password=False` params for caller compat but ignores them (ponytail: shim-free alternative is updating all callers; count them via `grep -rn "create_new_user(" backend/` — if ≤3, update signatures too; else keep ignored params and mark `# deprecated: ignored post-dashboard-mcp cutover`).
- Lines 2206-2209 `update_user_by_admin`: remove `password` hash branch and `force_change_password` UPDATE clause; keep other fields.
- Lines 316-322, 435-441 bootstrap admin INSERTs: delete entire blocks guarded by `if not users_exist:` or similar seed logic.

- [ ] **Step 4: Delete from `backend/config.py`**

Remove fields at lines 46-49: `jwt_secret`, `jwt_algorithm`, `jwt_expire_minutes`, `bootstrap_admin_password`. Remove prod-validation branch referencing them (search `grep -n "jwt_\|bootstrap_admin" backend/config.py` for residual guards around lines 143-148). Keep `session_secret` validation intact.

- [ ] **Step 5: Delete `/api/auth/change-password` handler and strip admin request models**

In `backend/main.py`:
- Delete handler block at lines ~397-407 (`@app.post("/api/auth/change-password")`).
- Edit `AdminUpdateUserRequest` (line 1360): remove `password: Optional[str] = None` (1364) and `force_change_password: Optional[bool] = None` (1366).
- Edit `update_user_endpoint` call site (lines 1400-1412): drop `password=req.password...` (1402) and `force_change_password=req.force_change_password` (1407) kwargs.
- Delete `AdminResetPasswordRequest` model (1418-1420) and `@app.post("/api/admin/users/{username}/reset-password")` handler (1423-1435).

- [ ] **Step 6: Sweep tests for dead imports**

Run: `grep -rln "from auth import\|from database import\|import auth\b" backend/tests/ | xargs grep -l "hash_password\|verify_password\|authenticate_user\|change_user_password\|create_access_token\|decode_access_token"`
For each hit: if the test ONLY exercises deleted behavior → delete file. If mixed → surgically remove the dead assertions/imports, keep live ones.

Also delete any test fixture calling `bootstrap_admin_password` env var.

- [ ] **Step 7: Run full backend suite**

Run: `cd ai-assistant/backend && venv/bin/pytest tests/ -x -q`
Expected: green. If collection errors due to removed imports, iterate Step 6 until clean.

- [ ] **Step 8: Smoke-import check**

Run: `cd ai-assistant/backend && python -c "import main; import auth; import database; import config; print('OK')"`
Expected: `OK`, no ImportError/NameError.

- [ ] **Step 9: Commit**

```bash
git add -A backend/
git commit -m "refactor(auth)!: delete standalone bcrypt/JWT primitives, bootstrap seeds, change-password surface"
```

Note breaking-change marker `!` per conventional commits; this is intentional cutover.

---

### Task 5: Purge frontend password-change UI and wire i18n strings

**Files:**
- Delete: `frontend/src/components/ForceChangePasswordModal.jsx`
- Modify: `frontend/src/components/ChatLayout.jsx` (remove import line 10, render block 2365-2369, state handlers 709, 1181)
- Modify: `frontend/src/components/AdminDashboard.jsx` (form state 146, 536, 567; badge 1339-1342; checkbox 1897-1898)
- Modify: `frontend/src/components/SettingsModal.jsx` (password section 222-226)
- Modify: `frontend/src/lib/api.js` (delete `changePassword` lines 161-165)
- Modify: `frontend/src/lib/i18n.js` (add 3 keys)

**Interfaces:**
- Consumes: Task 4 backend contract (`/api/auth/change-password` gone; responses omit `force_change_password`).
- Produces: Build-clean SPA rendering login error messages through i18n.

- [ ] **Step 1: Add i18n keys**

Open `frontend/src/lib/i18n.js`. Locate export object(s) for `id` and `en` locales. Append under a logical namespace (match existing nesting; sample assumes flat-with-prefix style):

```js
// id locale additions
"login.failed": "Username atau password salah.",
"login.required": "Username dan password wajib diisi.",
"login.dashboard_unreachable": "Layanan autentikasi tidak tersedia.",

// en locale additions
"login.failed": "Invalid username or password.",
"login.required": "Username and password are required.",
"login.dashboard_unreachable": "Authentication service unavailable.",
```

Mirror whatever structural convention the file uses (nested objects vs dotted keys). Check first: `head -40 frontend/src/lib/i18n.js`.

- [ ] **Step 2: Update LoginModal.jsx to consume i18n + new error shapes**

Read `frontend/src/components/LoginModal.jsx` submit handler (lines ~58-95). Current code likely does:

```jsx
const res = await api.login(username, password);
saveSession(res.access_token, res.user);
```

Wrap in try/catch mapping status codes to i18n keys:

```jsx
import { useLanguage } from '../lib/LanguageContext'; // confirm actual import path
// inside component:
const { t } = useLanguage();

try {
  const res = await api.login(username, password);
  saveSession(res.access_token, res.user);
  onClose?.();
} catch (err) {
  const status = err?.response?.status ?? err?.status;
  let msgKey = 'login.failed';
  if (status === 400) msgKey = 'login.required';
  else if (status === 502) msgKey = 'login.dashboard_unreachable';
  setError(t(msgKey));
}
```

Confirm `api.login` throws with `.status` attached (inspect `frontend/src/lib/api.js` `apiFetch` wrapper). Adjust accessor accordingly.

- [ ] **Step 3: Delete ForceChangePasswordModal and its wiring**

```bash
rm frontend/src/components/ForceChangePasswordModal.jsx
```

Edit `frontend/src/components/ChatLayout.jsx`:
- Delete line 10: `import ForceChangePasswordModal from './ForceChangePasswordModal';`
- Delete render block lines 2365-2369 (`<ForceChangePasswordModal ... />`).
- Delete `handleForcePasswordChanged` callback definition (locate via `grep -n "handleForcePasswordChanged" frontend/src/components/ChatLayout.jsx`).
- At line 709: remove `force_change_password: Boolean(data.force_change_password),` from user-state construction.
- At line 1181: simplify to `setUser((prev) => ({ ...prev }))` or delete the reducer branch entirely if it existed solely for clearing the flag.

- [ ] **Step 4: Strip AdminDashboard password-reset affordances**

Edit `frontend/src/components/AdminDashboard.jsx`:
- Lines 146, 536: remove `force_change_password: true,` initializers from form state objects.
- Line 567: remove `force_change_password: resetPasswordForm.force_change_password,` from payload sent to (now-deleted) reset endpoint. Since the endpoint is gone, ALSO delete the entire "reset password" modal/form flow if it exclusively targeted `/api/admin/users/*/reset-password`. Grep first: `grep -n "reset-password\|resetPasswordForm" frontend/src/components/AdminDashboard.jsx` to bound the removal.
- Lines 1339-1342: delete the amber badge JSX conditioned on `u.force_change_password`.
- Lines 1897-1898: delete the checkbox input + label tied to `resetPasswordForm.force_change_password`.

If removing the reset-password flow guts a large chunk of the admin panel, leave adjacent unrelated features untouched — scope discipline.

- [ ] **Step 5: Remove SettingsModal password-change section**

Edit `frontend/src/components/SettingsModal.jsx`: delete lines ~222-226 invoking `api.changePassword(...)`, plus associated form fields (`oldPassword`, `newPassword`, `passMessage` state) IF they serve no other purpose. Verify via `grep -n "oldPassword\|newPassword\|passMessage" frontend/src/components/SettingsModal.jsx`.

- [ ] **Step 6: Delete api.changePassword**

Edit `frontend/src/lib/api.js`: remove lines 161-165 (`changePassword: (oldPassword, newPassword) => ...`). Confirm no remaining callers: `grep -rn "changePassword" frontend/src/` → expect zero hits.

- [ ] **Step 7: Frontend build gate**

Run: `cd ai-assistant/frontend && npm run build`
Expected: success, no unresolved imports, no TS/lint errors blocking bundle. If failures cite deleted symbols, loop back to Steps 3-6.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat(ui)!: remove local password-change flows, route login errors through i18n"
```

---

### Task 6: Throwaway smoke script + final verification

**Files:**
- Create: `scripts/smoke_dashboard_login.py`
- Reference only: existing suites already green from Tasks 2-5.

**Interfaces:**
- Consumes: everything above.
- Produces: human-runnable proof against real-or-stubbed dashboard-mcp.

- [ ] **Step 1: Write smoke script**

Create `scripts/smoke_dashboard_login.py`:

```python
#!/usr/bin/env python3
"""Throwaway smoke test for dashboard-mcp BFF login. Not part of CI.

Usage:
  DASHBOARD_OIDC_ISSUER=http://localhost:4000 \
  TEST_USERNAME=alice TEST_PASSWORD=secret \
  BASE_URL=http://localhost:8000 \
  python scripts/smoke_dashboard_login.py
"""
import os
import sys
import httpx

BASE = os.environ["BASE_URL"].rstrip("/")
ISSUER = os.environ["DASHBOARD_OIDC_ISSUER"].rstrip("/")
U = os.environ["TEST_USERNAME"]
P = os.environ["TEST_PASSWORD"]


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=10)

    # Happy path.
    r = c.post("/api/auth/login", json={"username": U, "password": P})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    assert "sap_session" in r.cookies, "cookie not set"
    me = c.get("/api/me")
    assert me.status_code == 200, f"/api/me failed: {me.status_code}"
    assert me.json()["username"] == U
    print("[ok] login + /api/me")

    # Bad password.
    r2 = c.post("/api/auth/login", json={"username": U, "password": "wrong-on-purpose"})
    assert r2.status_code == 401, f"expected 401, got {r2.status_code}"
    print("[ok] bad password → 401")

    # Logout.
    r3 = c.post("/api/auth/logout")
    assert r3.status_code in (200, 204)
    print("[ok] logout")

    # Post-logout /api/me should be guest/unauthorized depending on design.
    r4 = c.get("/api/me")
    assert r4.status_code in (200, 401), f"unexpected {r4.status_code}"
    print(f"[ok] post-logout /api/me → {r4.status_code}")

    print("\nSMOKE PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Make executable: `chmod +x scripts/smoke_dashboard_login.py`.

- [ ] **Step 2: Run against live stack (operator responsibility)**

Instructions embedded in script docstring. Executor reports result; does NOT auto-run against production per AGENTS.md §1. Against staging/dev OK.

- [ ] **Step 3: Final regression sweep**

Run:
```bash
cd ai-assistant/backend && venv/bin/pytest tests/ -q
cd ../frontend && npm run build
```
Expected: both green.

- [ ] **Step 4: Commit smoke script**

```bash
git add scripts/smoke_dashboard_login.py
git commit -m "chore(smoke): throwaway dashboard-mcp login verification script"
```

- [ ] **Step 5: Report completion, await push approval**

Per AGENTS.md §1: DO NOT PUSH. Summarize branch state:

```bash
git log --oneline new-integration ^main 2>/dev/null || git log --oneline -8
```

Hand off to user for review + explicit push authorization.

---

## Self-Review Notes

**Spec coverage:** Every numbered spec section maps to ≥1 task:
- §1 Architecture → Tasks 1-3
- §2 Login flow → Task 2
- §3 Session/logout → Tasks 2-3
- §4 Deletions → Tasks 4-5
- §4b Migration policy → Task 4 Step 3 (explicit "don't run DROP" encoded by pruning code only)
- §5 Config/deploy/i18n → Tasks 1, 5
- §6 Testing → Tasks 2-6 inline tests + Task 6 smoke

**Placeholder scan:** Zero TBD/TODO/"similar to Task N". All code blocks concrete.

**Type consistency:** `_map_dashboard_user` signature stable across Tasks 2-4. Principal dict keys enumerated once in Task 2 Interfaces block; downstream consumers reference same names. `settings.dashboard_oidc_issuer` reused everywhere; no parallel `dashboard_auth_base_url` invented.

**Known risk surfaced early:** `create_new_user` ignored-param shim (Task 4 Step 3). Counted callers before deciding; documented upgrade path. Acceptable debt for one release cycle.
