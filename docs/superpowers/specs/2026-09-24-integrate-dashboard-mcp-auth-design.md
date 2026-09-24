# Design: Integrate ai-assistant Login to dashboard-mcp (ai_auth)

Date: 2026-09-24
Decision: Option A — delegate all credential verification to `dashboard-mcp` HTTP API (`/v1/auth/login`). Remove standalone local auth entirely. No fallback.

## 1. Architecture Overview

Current: `backend/auth.py` mints local JWTs via bcrypt password verification against `ai_assistant_dev.users.password_hash`. OIDC machinery exists (`_verify_oidc_id_token`, JWKS, RS256) but is unused by login.

Target: Backend becomes a BFF proxy. `/api/auth/login` forwards `{username, password}` to `dashboard-mcp`'s `/v1/auth/login`, receives `{accessToken, expiresIn, user}`, maps the user shape to the existing principal dict, and mints its own signed session cookie. Frontend SPA unchanged in shape — still POSTs credentials, still reads `{status, user}` back.

```
Browser → FE /api/auth/login → BE httpx POST {issuer}/v1/auth/login → dashboard-mcp → ai_auth DB
                                                                              ↓
Browser ← FE reads response ← BE sets sap_session cookie ← BE maps user ←───┘
```

## 2. Login Flow (Backend BFF Proxy)

File: `backend/main.py:326`

Rewrite `auth_login` to ~15 lines:

```python
@app.post("/api/auth/login")
async def auth_login(req: LoginRequest, response: Response):
    username = (req.username or "").strip()
    password = (req.password or "").strip()
    if not username or not password:
        raise HTTPException(400, detail="Username dan password wajib diisi.")

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login",
            json={"username": username, "password": password,
                  "clientCode": settings.dashboard_oidc_client_id},
        )
    if r.status_code != 200:
        raise HTTPException(401, detail="Username atau password salah.")
    session = r.json()

    principal = _map_dashboard_user(session["user"], session["accessToken"])
    response.set_cookie(
        key=settings.session_cookie_name,
        value=create_session_cookie(principal),
        httponly=True, secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        max_age=session.get("expiresIn") or settings.session_expire_hours * 3600,
        path="/",
    )
    return {"status": "success", "access_token": session["accessToken"],
            "token_type": "bearer", "user": {**principal, "authenticated": True}}
```

### `_map_dashboard_user(dash_user, access_token) -> dict`

Maps `DashboardPublicUser` (from `rag-fe-trst/src/auth/types.ts`) to the existing principal keys:

| dashboard-mcp field | principal key | Notes |
|---|---|---|
| `id` | `sub` | |
| `username` | `username` | |
| `rawRole` or `role` | `role`, `roles` | Lowercase via `access_control.normalize_roles` |
| `departments[0].name` | `org_units` | List of dept names |
| `divisions[0]` | `division_code`, `division_name` | First division |
| positions | `job_level` | From first position's `jobLevel` |
| `displayName` or `username` | `full_name` | |
| — | `is_guest` | Always `False` |
| `access_token` param | `access_token` | Passed through for downstream MCP calls |
| — | `assistant_persona` | Empty string; populated later from local DB |
| — | `force_change_password` | Always `False`; no local passwords |

Role normalization reuses `access_control.normalize_roles`. No local DB read on login.

Risk: `dashboard-mcp` down → login fails hard. Accepted per user decision. Add circuit-breaker only when it bites.

## 3. Session Verification & Logout

### Keep unchanged
- `create_session_cookie` / `decode_session_cookie` — sign/verify BFF's own HS256 cookie using `session_secret`.
- `get_current_principal` / `get_current_user` / `get_current_user_optional` / `require_superadmin` — operate on the BFF cookie, not dashboard tokens directly.

### Logout (`main.py:410 oidc_logout`)
Add best-effort upstream logout before deleting local cookie:
```python
try:
    async with httpx.AsyncClient(timeout=5) as client:
        await client.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/logout")
except Exception:
    pass  # fire-and-forget; local cookie deletion is authoritative
resp.delete_cookie(settings.session_cookie_name, path="/")
```
Mirrors `rag-fe-trst/src/auth/api.ts:120`.

### No refresh loop
BFF cookie TTL == `expiresIn` from dashboard-mcp. When expired, `/api/auth/session` returns guest → SPA shows login modal. Skips `/auth/refresh` machinery. Add when UX demands silent renewal.

## 4. Deletions (Clean Cutover)

### backend/auth.py — DELETE
- `hash_password`, `verify_password`, `is_bcrypt_hash`
- `create_access_token`, `decode_access_token`
- `_get_signing_secret`, `_get_algorithm`
- `generate_code_verifier`, `generate_code_challenge`
- Standalone JWT block (lines ~29–100, 148–158)

### backend/auth.py — KEEP
- `set_dashboard_access_token`, `get_dashboard_access_token`
- `create_session_cookie`, `decode_session_cookie`
- `_extract_token_from_request`
- `get_current_principal`, `get_current_user`, `get_current_user_optional`, `require_superadmin`
- `GUEST_USERNAME`, `GUEST_ROLE`

### backend/database.py — DELETE
- `authenticate_user` (lines 543–614)
- `change_user_password` (lines 617–653)
- Bootstrap admin INSERTs (lines 316–322, 435–441)
- `password_hash` column reads in SELECT projections (keep column in schema per AGENTS.md §2)

### backend/config.py — DELETE
- `jwt_secret`, `jwt_algorithm`, `jwt_expire_minutes` fields
- `bootstrap_admin_password` field
- Prod validation branches referencing deleted fields (lines 143–148)

### frontend/src/lib/api.js — DELETE
- `changePassword` function (lines 161–165)

### frontend/src/components/ForceChangePasswordModal.jsx
- Delete file entirely. Remove import from `ChatLayout.jsx:10` and render block at `ChatLayout.jsx:2365-2369`.
- Remove `handleForcePasswordChanged` callback and `force_change_password` field reads/writes in `ChatLayout.jsx:709,1181`.
- Remove `force_change_password` badge render in `AdminDashboard.jsx:1339-1342`.
- Remove `force_change_password` checkbox + form state in `AdminDashboard.jsx:146,536,567,1897-1898`.
- Remove password-change section in `SettingsModal.jsx:222-226` (calls deleted `api.changePassword`).

### backend/main.py — DELETE handlers
- `/api/auth/change-password` (lines ~397-407).
- Strip `password` and `force_change_password` fields from `AdminUpdateUserRequest` (line 1364, 1366) and their forwarding at lines 1402, 1407.
- DELETE `/api/admin/users/{username}/reset-password` endpoint (lines 1418-1435) and `AdminResetPasswordRequest` model.

### backend/database.py — additional DELETE
- `reset_user_password_by_admin` (line 2051) — no local passwords to reset.
- `force_change_password` column references in SELECT projections: lines 756, 787, 1962, 1989. Leave column in DDL per §Migration Policy below.
- `create_new_user`: drop `password_hash` INSERT (line 2030) and `force_change_password` param (line 2000, 2033). Function becomes identity-seed only; rename optional, keep signature-compatible for callers.
- `update_user_by_admin`: drop `password` hash branch (line 2206) and `force_change_password` update (lines 2207-2209).

## 4b. Migration Policy

Existing `_execute_identity_migration` (migrations.py:1124) DROPs `password`, `password_hash`, `force_change_password`. This violates AGENTS.md §2 ("never drop databases/schemas").

Decision: **do NOT run that migration**. Columns stay in schema as vestigial nullable fields. All code paths stop reading/writing them. If future cleanup is desired, it goes through an explicit operator-approved destructive migration ticket, not this feature.

Consequence: `ensure_user_exists` seeding path keeps working unchanged (it never touched those columns). Existing rows retain whatever value they had; ignored by new code.
### Tests
- Any test importing removed symbols: delete, don't patch.
- Rewrite tests that exercise login flow to mock `httpx` call to dashboard-mcp instead of `authenticate_user`.

### Preserve
- `ensure_user_exists` still called from `auth_session` (main.py:451) to seed local preference rows (`assistant_persona`, SAP credentials linkage). Writes no password, only mirrors identity for app-local state.

## 5. Config & Deploy

### .env changes
```diff
+ DASHBOARD_OIDC_ISSUER=http://dashboard-mcp:4000   # already exists, reuse as login base
  SESSION_SECRET=<required>                          # already required in prod
- JWT_SECRET=
- BOOTSTRAP_ADMIN_PASSWORD=
```

### docker-compose.yml
Confirm `dashboard-mcp` is on the same Docker network (already implied by `dashboard_mcp_gateway_url`). Add explicit dependency if missing.

### nginx.conf
Unchanged. FE→BE `/api/` proxy already forwards cookies. BE→dashboard-mcp is server-side HTTP via `httpx`, no browser involvement.

### i18n (AGENTS.md §5)
Add to `frontend/src/lib/i18n.js`:
- `login.failed` → id: "Username atau password salah." / en: "Invalid username or password."
- `login.required` → id: "Username dan password wajib diisi." / en: "Username and password are required."
- `login.dashboard_unreachable` → id: "Layanan autentikasi tidak tersedia." / en: "Authentication service unavailable."

Backend error strings stay Indonesian-only (wrapped by FE catch).

## 6. Testing & Verification

### Throwaway smoke script
`scripts/smoke_dashboard_login.py` (not permanent):
1. Mock dashboard-mcp via `respx` returning canned `{accessToken, expiresIn, user:{id, username, rawRole:"ADMIN", departments:[...]}}`.
2. POST `/api/auth/login` → assert 200, cookie set, response `user.role=="admin"`, `org_units` populated.
3. GET `/api/me` with that cookie → assert same principal.
4. Wrong-password mock (401 upstream) → assert 401, no cookie.
5. Dashboard down (connection error) → assert 502, no crash.

### Existing suite
`cd ai-assistant/backend && venv/bin/pytest tests/` must go green after deletions. Tests importing removed symbols get deleted.

### Frontend build
`cd ai-assistant/frontend && npm run build` must succeed (per AGENTS.md §3).

## 7. Open Decisions

None. All decisions locked per user approval of Sections 1–6.
