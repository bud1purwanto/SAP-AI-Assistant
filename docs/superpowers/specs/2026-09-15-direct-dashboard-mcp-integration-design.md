# Direct Dashboard MCP Integration Design

## Overview
Directly fetch all MCP servers, sub-servers (SAP, SQL, services), tools, and runtime statuses from `dashboard-mcp` (`GET /v1/integration/resources`) in real-time, removing reliance on local PostgreSQL tables (`ai_assistant_dev.mcp_servers` and `ai_assistant_dev.mcp_resources`) as the source of truth in `SAP-AI-Assistant`.

## Architecture & Data Flow

```
+---------------------------+             +-------------------------------+
|  Frontend SAP Assistant   |             |   Dashboard MCP (Port 3000)   |
|   (Access Control / MCP)  |             |  - Server Configs             |
+-------------+-------------+             |  - Target Connections         |
              |                           |  - Discovered Resources       |
              | GET /api/admin/access/..  +---------------+---------------+
              v                                           ^
+-------------+-------------+                             |
|   Backend SAP Assistant   |                             |
|  - access_control.py      |                             |
|  - mcp_manager.py         +-- GET /v1/integration/------|
|  - main.py                |       resources
+-------------+-------------+
              |
              | (Only Role & User Permissions Matrix)
              v
+-------------+-------------+
|    PostgreSQL Database    |
| - role_mcp_access         |
| - user_mcp_access         |
+---------------------------+
```

## Component Changes

### 1. `backend/mcp_manager.py`
- Refactor `_fetch_dashboard_resources()` and `check_servers_status()` to use `dashboard-mcp` as the primary and authoritative source for all servers, sub-servers, and statuses.
- Standardize resource mappings returned from `dashboard-mcp` (e.g. `resource_key`, `kind`, `label`, `sid`, `client`, `is_production`).
- Remove queries and writes to `ai_assistant_dev.mcp_servers` and `ai_assistant_dev.mcp_resources`.

### 2. `backend/access_control.py`
- `get_all_resources()` resolves resources directly from `mcp_manager`'s cached/live `dashboard-mcp` data rather than querying `ai_assistant_dev.mcp_resources`.
- `get_all_roles_matrix()` and `get_user_access_matrix()` construct role/user permission matrices against live resources from `dashboard-mcp`.
- Deprecate/clean up `sync_resources_from_mcp()` since sync is no longer stored in the local DB.

### 3. `backend/main.py`
- `/api/mcp/servers`, `/api/admin/mcp/servers`, and `/api/admin/stats` return server metadata and live status directly from `dashboard-mcp`.
- `/api/admin/access/resources` and `/api/admin/access/resources/sync` query and return live resources from `dashboard-mcp`.

### 4. Database Schema Impact
- `ai_assistant_dev.role_mcp_access` and `ai_assistant_dev.user_mcp_access` persist `(role, resource_key)` and `(username, resource_key)` records.
- `ai_assistant_dev.mcp_servers` and `ai_assistant_dev.mcp_resources` tables are bypassed and no longer required for MCP server discovery or listing.

## Verification & Testing
- Unit & integration tests in `tests/test_access_control.py` and `tests/test_mcp_manager.py` to verify:
  1. Live fetching of resources from `dashboard-mcp`.
  2. Construction of role and user access matrices against dynamic resources.
  3. Filtering of servers/sub-servers for non-admin users based on role/user permissions.
  4. Correct fallback handling when `dashboard-mcp` is temporarily unreachable.
