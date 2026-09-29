# Task 2 Execution Report: Refactor access_control.py for Direct Dashboard-MCP Live Resources

## Status
DONE

## Files Changed
- `SAP-AI-Assistant/backend/access_control.py`
  - Added `DEFAULT_FALLBACK_RESOURCES` constant defining standard fallback catalog resources (`sap:dev-aix`, `sap:prod-aix`, `service:rag`, `service:email`).
  - Refactored `get_all_resources(include_archived: bool = False)` to query `mcp_manager.get_live_resources_sync()` directly, standardizing resource attributes (`resource_key`, `kind`, `label`, `sid`, `client`, `is_production`, `archived`, `first_seen_at`, `last_seen_at`), sorting by `(kind ASC, is_production ASC, resource_key ASC)`, filtering archived entries when `include_archived=False`, and using `DEFAULT_FALLBACK_RESOURCES` when live resources are empty.
  - Refactored `load_aliases_from_db(force_refresh: bool = False)` to populate dynamic maps (`_DYNAMIC_SAP_MAP`, `_DYNAMIC_SQL_MAP`, `_DYNAMIC_GENERAL_MAP`) from `get_all_resources()` instead of querying the `ai_assistant_dev.mcp_resources` table.
  - Refactored `sync_resources_from_mcp(status_dict: dict) -> List[str]` to register discovered aliases in-memory via `register_mcp_aliases()` and return the active keys list without issuing any SQL `INSERT` or `UPDATE` statements to `ai_assistant_dev.mcp_resources`.
  - Refactored `allowed_connectors(username, role)` to derive custom server IDs from `get_all_resources(include_archived=False)` instead of calling `database.list_mcp_servers()`.
  - Updated `resolve_access(username, role)` to dynamically initialize fallback permission entries (`allowed=False`, `source="deny_default"`) for any resources explicitly configured in `role_resource_access` or `user_resource_access` tables even if not currently in live discovery.
  - Completely eliminated all SQL statements querying or writing to `ai_assistant_dev.mcp_resources` and `ai_assistant_dev.mcp_servers`.

- `SAP-AI-Assistant/tests/test_direct_dashboard_mcp.py`
  - Added test suite for access control refactoring:
    - `test_access_control_get_all_resources_uses_live_resources`: verifies that `get_all_resources` delegates to `mcp_manager.get_live_resources_sync()`, normalizes dictionary keys, and sorts correctly.
    - `test_access_control_get_all_resources_fallback_when_empty`: verifies fallback to `DEFAULT_FALLBACK_RESOURCES` when live resources are unavailable or empty.
    - `test_access_control_get_all_roles_matrix_uses_live_resources`: verifies that matrix generation relies on live resources.
    - `test_access_control_load_aliases_from_db_uses_get_all_resources`: verifies dynamic alias mappings populated from `get_all_resources()` without database queries.
    - `test_access_control_sync_resources_from_mcp_no_db_write`: verifies that `sync_resources_from_mcp()` registers aliases in-memory and executes zero database transactions/writes.

## Tests Run and Output Summary
Command: `/data/apps/rag_env/bin/pytest tests/test_direct_dashboard_mcp.py tests/test_access_control.py -v` (CWD: `/data/apps/MCP/SAP-AI-Assistant`)
Output:
```text
============================= test session starts ==============================
platform linux -- Python 3.12.3, pytest-9.1.1, pluggy-1.6.0
rootdir: /data/apps/MCP/SAP-AI-Assistant
configfile: pytest.ini
plugins: asyncio-1.4.0, langsmith-0.12.4, anyio-4.14.2
asyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collected 20 items

tests/test_direct_dashboard_mcp.py ..........                            [ 50%]
tests/test_access_control.py ..........                                  [100%]

============================== 20 passed in 2.30s ==============================
```

Command: `/data/apps/rag_env/bin/pytest tests/test_dynamic_mcp.py -v` (CWD: `/data/apps/MCP/SAP-AI-Assistant`)
Output:
```text
============================= test session starts ==============================
platform linux -- Python 3.12.3, pytest-9.1.1, pluggy-1.6.0
rootdir: /data/apps/MCP/SAP-AI-Assistant
configfile: pytest.ini
plugins: asyncio-1.4.0, langsmith-0.12.4, anyio-4.14.2
asyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collected 6 items

tests/test_dynamic_mcp.py ......                                         [100%]

============================== 6 passed in 2.89s ===============================
```

## Verification Checklist
- [x] Smallest viable diff adhering to existing patterns.
- [x] Zero references to `ai_assistant_dev.mcp_resources` or `ai_assistant_dev.mcp_servers` in `access_control.py`.
- [x] Dynamic in-memory alias loading operational from live resources.
- [x] Fallback to standard defaults operational when gateway/live discovery returns empty.
- [x] All 26 unit and regression tests pass cleanly.
