# Task 3 Brief: Update main.py endpoints for live dashboard resources

## Goal
Update endpoints in `SAP-AI-Assistant/backend/main.py` so that MCP server lists, statistics, and access control resources are served directly from `mcp_manager` live discovery rather than querying `database.list_mcp_servers()`.

## Target Files
- Modify: `SAP-AI-Assistant/backend/main.py`
- Test: `SAP-AI-Assistant/tests/test_direct_dashboard_mcp.py`

## Requirements
1. In `main.py`:
   - In `get_admin_stats_endpoint`:
     - Remove `servers = list_mcp_servers(enabled_only=False)`.
     - Construct `stats["mcp_servers"]` directly from `mcp_st.values()`.
     - Format each item with `id`, `name`, `description`, `online`, `status`, `enabled`, `tool_count`, `tools_count`, `active_server`, `icon`, `display_order`.
   - In `get_mcp_servers`:
     - Keep calling `mcp_manager.check_servers_status()`, `access_control.sync_resources_from_mcp(raw)`, and filtering via `access_control.filter_servers_for_user`.
   - In `get_admin_access_resources_endpoint`:
     - Returns `{"resources": access_control.get_all_resources(include_archived=False)}`.
   - In `sync_admin_access_resources_endpoint`:
     - Ensure it forces a fresh fetch (`await mcp_manager.get_live_resources(force_refresh=True)`) and updates status without database queries.
   - In `get_admin_mcp_servers_endpoint`:
     - Instead of raising 410, return `{"servers": list(mcp_st.values())}` or active servers from `mcp_manager.check_servers_status()` so any admin component calling it gets the live list.
2. In `tests/test_direct_dashboard_mcp.py`:
   - Add integration tests for FastAPI endpoints:
     - `GET /api/admin/stats`: assert `stats["mcp_servers"]` is populated from dashboard without calling `database.list_mcp_servers`.
     - `GET /api/admin/access/resources`: assert returns resources from live discovery.
     - `POST /api/admin/access/resources/sync`: assert returns synced keys and fresh resources.
     - `GET /api/mcp/servers`: assert returns filtered live servers.

## Global Constraints
- Do NOT read from or write to `ai_assistant_dev.mcp_servers` or `ai_assistant_dev.mcp_resources`.
- Run tests: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py -v`.
