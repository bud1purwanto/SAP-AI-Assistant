# Task 3 Execution Report: Serve admin MCP data from live Dashboard MCP

## Status
DONE

## Changes
- `backend/main.py`
  - `GET /api/admin/stats` now assigns `mcp_servers` directly from `mcp_manager.check_servers_status()` and no longer calls `list_mcp_servers()`.
  - `POST /api/admin/access/resources/sync` forces `mcp_manager.get_live_resources(force_refresh=True)` before rebuilding status and aliases.
  - `GET /api/admin/mcp/servers` now returns the live status list from `mcp_manager.check_servers_status()`; local server mutations remain decommissioned.
- `tests/test_direct_dashboard_mcp.py`
  - Added behavioral endpoint tests proving stats do not use `list_mcp_servers`, the admin server list is live, and resource sync forces refresh.
- `tests/test_dynamic_mcp.py`
  - Updated stale list-endpoint expectations: the list is a supported live read surface; create/update/delete/reset remain decommissioned.

## Verification
`/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py tests/test_access_control.py tests/test_dynamic_mcp.py -v`

Result: 30 passed.
