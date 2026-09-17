# Task 1 Execution Report: Refactor mcp_manager.py for direct dashboard-mcp resources

## Status
DONE

## Files Changed
- `SAP-AI-Assistant/backend/mcp_manager.py`
  - Added `_resources_cache`, `_resources_cache_time`, and `_cache_ttl` (10s) in `MCPManager.__init__`.
  - Implemented async `get_live_resources(force_refresh=False)` with in-memory TTL caching.
  - Implemented sync `get_live_resources_sync(force_refresh=False)` with TTL caching and safe sync HTTP fallback via `httpx.Client`.
  - Refactored `_fetch_dashboard_resources(http_client)` to query `GET /v1/integration/resources` using `settings.dashboard_mcp_api_token` and update cache.
  - Refactored `check_servers_status()` to make `dashboard-mcp` the authoritative source for servers, sub-servers (`sap`, `sql`), and runtime statuses (`sap`, `rag`, `sql`, `email`, and dynamic custom servers).
  - Removed all database queries to `ai_assistant_dev.mcp_servers` and `ai_assistant_dev.mcp_resources`.
  - Added graceful fallback returning standard offline server status dict when `dashboard-mcp` is unreachable.
  - Refactored `get_all_tools()` to discover custom dynamic MCP servers via `get_live_resources()` instead of querying `database.list_mcp_servers()`.
- `SAP-AI-Assistant/tests/test_direct_dashboard_mcp.py`
  - Added unit and integration tests verifying:
    - `test_check_servers_status_from_dashboard_mcp`: verifies server status, sub-servers, and tool counts from dashboard response.
    - `test_get_live_resources_caching`: verifies caching and `force_refresh=True` behavior.
    - `test_get_live_resources_sync`: verifies synchronous cache return and fallback.
    - `test_check_servers_status_fallback_when_dashboard_unreachable`: verifies offline structure without exceptions when gateway is down.
    - `test_no_database_mcp_servers_calls`: verifies that `database.list_mcp_servers()` is never called.

## Tests Run and Output Summary
Command: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py -v` (CWD: `/data/apps/MCP/SAP-AI-Assistant`)
Output:
```text
============================= test session starts ==============================
platform linux -- Python 3.12.3, pytest-9.1.1, pluggy-1.6.0
rootdir: /data/apps/MCP/SAP-AI-Assistant
configfile: pytest.ini
plugins: asyncio-1.4.0, langsmith-0.12.4, anyio-4.14.2
asyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collected 5 items

tests/test_direct_dashboard_mcp.py .....                                 [100%]

============================== 5 passed in 0.24s ===============================
```

## Notes or Concerns
- Zero database queries or writes to `ai_assistant_dev.mcp_servers` and `ai_assistant_dev.mcp_resources` remain in `mcp_manager.py`.
- Dynamic resource caching uses a 10s TTL, which avoids hammering `dashboard-mcp` while ensuring near real-time discovery of SAP/SQL sub-servers and services.
