# Direct Dashboard MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Directly fetch all MCP servers, sub-servers, tools, and runtime statuses from `dashboard-mcp` (`GET /v1/integration/resources`) in real-time, removing dependence on local PostgreSQL tables (`ai_assistant_dev.mcp_servers` and `ai_assistant_dev.mcp_resources`).

**Architecture:** Route all MCP resource discovery and status checks to `dashboard-mcp`'s `/v1/integration/resources` endpoint via `mcp_manager`. `access_control.py` uses this live resource catalog to build role and user permission matrices while storing only user/role grants in the database.

**Tech Stack:** Python (FastAPI, httpx, SQLAlchemy, pytest), React.

**Spec:** `SAP-AI-Assistant/docs/superpowers/specs/2026-09-15-direct-dashboard-mcp-integration-design.md`

## Global Constraints
- Do NOT read from or write to `ai_assistant_dev.mcp_servers` or `ai_assistant_dev.mcp_resources`.
- Retain standalone auth and role/user permission grants in `role_mcp_access` and `user_mcp_access`.
- Provide robust fallback if `dashboard-mcp` is temporarily unreachable so the app does not crash.

---

### Task 1: Refactor `mcp_manager.py` to make `dashboard-mcp` the authoritative source

**Files:**
- Modify: `SAP-AI-Assistant/backend/mcp_manager.py`
- Test: `SAP-AI-Assistant/tests/test_direct_dashboard_mcp.py`

**Interfaces:**
- Consumes: `GET /v1/integration/resources` from `dashboard-mcp`
- Produces: `mcp_manager.get_live_resources() -> List[Dict[str, Any]]` and `mcp_manager.check_servers_status() -> Dict[str, Any]`

- [ ] **Step 1: Write the failing test for dashboard MCP live fetching**

```python
# tests/test_direct_dashboard_mcp.py
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_check_servers_status_from_dashboard_mcp():
    from mcp_manager import mcp_manager
    mock_payload = {
        "resources": [
            {
                "resource_key": "sap:dev-aix",
                "kind": "sap",
                "label": "SAP Development AIX",
                "sid": "DEV",
                "client": "130",
                "is_production": False,
            },
            {
                "resource_key": "service:rag",
                "kind": "service",
                "label": "Manufacturing RAG",
                "is_production": False,
            }
        ],
        "status": {
            "sap": {"online": True, "status": "online", "tool_count": 5},
            "rag": {"online": True, "status": "online", "tool_count": 3}
        }
    }
    with patch.object(mcp_manager, "_fetch_dashboard_resources", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_payload
        status = await mcp_manager.check_servers_status()
        assert "sap" in status
        assert status["sap"]["online"] is True
        assert len(status["sap"]["sub_servers"]) >= 1
        assert status["sap"]["sub_servers"][0]["name"] == "SAP Development AIX"
        
        resources = await mcp_manager.get_live_resources()
        assert len(resources) == 2
        assert any(r["resource_key"] == "sap:dev-aix" for r in resources)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py -v`
Expected: FAIL (e.g. `get_live_resources` not implemented)

- [ ] **Step 3: Implement authoritative live discovery in `mcp_manager.py`**

Refactor `mcp_manager.py`:
- Add `get_live_resources()` which fetches from `_fetch_dashboard_resources()` and caches with a short TTL (e.g. 5-10s).
- In `check_servers_status()`, build server status and sub-servers directly from the dashboard response.
- Eliminate database calls to `ai_assistant_dev.mcp_servers`.

- [ ] **Step 4: Run test to verify it passes**

Run: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py -v`
Expected: PASS

---

### Task 2: Refactor `access_control.py` to use live resources from `dashboard-mcp`

**Files:**
- Modify: `SAP-AI-Assistant/backend/access_control.py`
- Test: `SAP-AI-Assistant/tests/test_direct_dashboard_mcp.py`

**Interfaces:**
- Consumes: `mcp_manager.get_live_resources()`
- Produces: `access_control.get_all_resources()`, `access_control.get_all_roles_matrix()`, `access_control.get_user_access_matrix()`

- [ ] **Step 1: Write failing test for access control with live resources**

```python
# In tests/test_direct_dashboard_mcp.py
@pytest.mark.asyncio
async def test_access_control_uses_dashboard_resources():
    import access_control
    from mcp_manager import mcp_manager
    mock_resources = [
        {
            "resource_key": "sap:dev-aix",
            "kind": "sap",
            "label": "SAP Development AIX",
            "sid": "DEV",
            "client": "130",
            "is_production": False,
        }
    ]
    with patch.object(mcp_manager, "get_live_resources_sync", return_value=mock_resources):
        resources = access_control.get_all_resources()
        assert len(resources) == 1
        assert resources[0]["resource_key"] == "sap:dev-aix"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py -v`
Expected: FAIL

- [ ] **Step 3: Update `access_control.py`**

- In `access_control.py`, update `get_all_resources()` to retrieve items from `mcp_manager.get_live_resources()` (or synchronous cached helper `get_live_resources_sync()`).
- Stop querying `ai_assistant_dev.mcp_resources`.
- Keep `role_mcp_access` and `user_mcp_access` logic intact for checking permissions against those dynamic keys.

- [ ] **Step 4: Run test to verify it passes**

Run: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py -v`
Expected: PASS

---

### Task 3: Update `main.py` endpoints and verify API responses

**Files:**
- Modify: `SAP-AI-Assistant/backend/main.py`
- Test: `SAP-AI-Assistant/tests/test_direct_dashboard_mcp.py`

**Interfaces:**
- Consumes: `mcp_manager.check_servers_status()` and `access_control.get_all_resources()`
- Produces: Endpoints `/api/mcp/servers`, `/api/admin/mcp/servers`, `/api/admin/access/resources`, `/api/admin/access/resources/sync`

- [ ] **Step 1: Write test for endpoints returning dashboard data**

```python
# In tests/test_direct_dashboard_mcp.py
@pytest.mark.asyncio
async def test_admin_access_resources_endpoint(client, superadmin_token):
    # Verify GET /api/admin/access/resources returns resources sourced from dashboard
    pass
```

- [ ] **Step 2: Update endpoints in `main.py`**
- Adjust `/api/admin/mcp/servers` to return the list of servers directly from `mcp_manager.check_servers_status()`.
- Adjust `/api/admin/access/resources` and `/api/admin/access/resources/sync` to return live resources.
- Remove redundant sync queries writing to PostgreSQL.

- [ ] **Step 3: Run all test suites**

Run: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py tests/test_auth.py tests/test_sap_credentials.py tests/test_database.py -v`
Expected: 100% PASS

---

### Task 4: End-to-End Verification & Health Check

- [ ] **Step 1: Run full pytest test suite**
- [ ] **Step 2: Verify `SAP-AI-Assistant` backend startup without DB table dependencies for MCP**
- [ ] **Step 3: Verify clean git status & documentation**
