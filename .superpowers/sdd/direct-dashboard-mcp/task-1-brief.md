# Task 1 Brief: Refactor mcp_manager.py for direct dashboard-mcp resources

## Goal
Make `dashboard-mcp` the authoritative source for all MCP servers, sub-servers, tools, and runtime status in `SAP-AI-Assistant/backend/mcp_manager.py`.
Remove reliance on local PostgreSQL tables (`ai_assistant_dev.mcp_servers` and `ai_assistant_dev.mcp_resources`).

## Target Files
- Modify: `SAP-AI-Assistant/backend/mcp_manager.py`
- Test: `SAP-AI-Assistant/tests/test_direct_dashboard_mcp.py`

## Requirements
1. In `mcp_manager.py`:
   - Implement `get_live_resources(force_refresh=False)` (async) and `get_live_resources_sync(force_refresh=False)` (sync, returns cached data or synchronously fetches / falls back safely).
   - In `_fetch_dashboard_resources(http_client)`:
     Ensure it contacts `f"{settings.dashboard_mcp_url.rstrip('/')}/v1/integration/resources"` using `settings.dashboard_mcp_api_token`.
     Extract `resources` list (with items containing `resource_key`, `kind`, `label`, `sid`, `client`, `is_production`, etc.) and `status` dictionary.
   - Cache discovered resources in memory with a short TTL (e.g. 10 seconds) so repeated calls don't hammer the gateway.
   - In `check_servers_status()`:
     - DO NOT call `database.list_mcp_servers()`.
     - Fetch from `_fetch_dashboard_resources(http_client)`.
     - Build status structure containing entries for `sap`, `rag`, `sql`, `email`, and any additional custom servers present in dashboard response.
     - For SAP, populate `sub_servers` from the discovered resources where `kind == "sap"`.
     - If dashboard-mcp returns valid status/resources, use them directly.
     - If dashboard-mcp is temporarily unreachable or errors out, fall back gracefully to default offline status without crashing.
2. In `tests/test_direct_dashboard_mcp.py`:
   - Write pytest tests using `pytest-asyncio` mocking `_fetch_dashboard_resources` to verify:
     - `check_servers_status()` correctly formats servers and sub-servers from dashboard payload.
     - `get_live_resources()` returns the list of resources.
     - Fallback works cleanly when `_fetch_dashboard_resources` returns `None`.

## Global Constraints
- Do NOT read from or write to `ai_assistant_dev.mcp_servers` or `ai_assistant_dev.mcp_resources`.
- Retain standalone auth and user/role grants.
- Test must pass with: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py -v`.
