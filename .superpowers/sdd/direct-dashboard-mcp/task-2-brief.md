# Task 2 Brief: Refactor access_control.py to use live resources

## Goal
Refactor `SAP-AI-Assistant/backend/access_control.py` to retrieve the catalog of resources directly from `mcp_manager.get_live_resources_sync()` instead of querying the PostgreSQL table `ai_assistant_dev.mcp_resources`.

## Target Files
- Modify: `SAP-AI-Assistant/backend/access_control.py`
- Test: `SAP-AI-Assistant/tests/test_direct_dashboard_mcp.py`

## Requirements
1. In `access_control.py`:
   - Refactor `get_all_resources(include_archived: bool = False) -> List[Dict[str, Any]]`:
     - Import and call `mcp_manager.get_live_resources_sync()`.
     - Standardize dictionary format:
       `resource_key` (str), `kind` (str), `label` (str), `sid` (str), `client` (str), `is_production` (bool), `archived` (bool, default False), `first_seen_at` (None or ISO str), `last_seen_at` (None or ISO str).
     - Sort by `kind ASC, is_production ASC, resource_key ASC`.
     - Completely eliminate the `SELECT ... FROM ai_assistant_dev.mcp_resources` query.
     - Fall back to standard default resources (`sap:dev-aix`, `sap:prod-aix`, `service:rag`, `service:email`) if `mcp_manager` returns empty list and no cache is available.
   - Refactor `load_aliases_from_db()`:
     - Populate dynamic alias maps (`_DYNAMIC_SAP_MAP`, `_DYNAMIC_SQL_MAP`) using `get_all_resources()` instead of querying the `mcp_resources` table.
   - Refactor `sync_resources_from_mcp(status_dict: dict) -> List[str]`:
     - Remove `INSERT INTO ai_assistant_dev.mcp_resources` and `UPDATE ai_assistant_dev.mcp_resources` queries.
     - Register dynamic aliases using `register_mcp_aliases` for discovered SAP/SQL sub-servers and services.
     - Return the list of active resource keys.
   - Ensure `get_all_roles_matrix()` and `get_user_access_matrix(username)` continue to function correctly using the live resources from `get_all_resources()` mapped to `role_mcp_access` and `user_mcp_access`.
2. In `tests/test_direct_dashboard_mcp.py`:
   - Add tests verifying:
     - `get_all_resources()` returns live resources from `mcp_manager`.
     - `get_all_roles_matrix()` builds matrix across the live dashboard resources.
     - `sync_resources_from_mcp()` no longer executes queries against `mcp_resources`.
     - Access matrix filters properly for users based on effective roles/overrides.

## Global Constraints
- Do NOT read from or write to `ai_assistant_dev.mcp_servers` or `ai_assistant_dev.mcp_resources`.
- Retain standalone auth and role/user permission grants in `role_mcp_access` and `user_mcp_access`.
- Test command: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py tests/test_access_control.py -v`.
