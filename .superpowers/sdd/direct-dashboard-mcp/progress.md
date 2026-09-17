# SDD ledger — plan: docs/superpowers/plans/2026-09-15-direct-dashboard-mcp-integration-plan.md

## Pre-flight Plan Scan
- Task 1: Refactor `mcp_manager.py` to make `dashboard-mcp` the authoritative source. Produces `get_live_resources()` and `check_servers_status()`.
- Task 2: Refactor `access_control.py` to use `get_live_resources()`. Consumes `mcp_manager.get_live_resources()`.
- Task 3: Update `main.py` endpoints `/api/mcp/servers`, `/api/admin/mcp/servers`, `/api/admin/access/resources`, `/api/admin/stats`.
- Task 4: End-to-end verification and full pytest test suites.

Conflicts scan: Clean. Tasks are sequential and clearly decoupled.
No plan defects found.

Task 1: complete (mcp_manager refactored for direct dashboard-mcp resources, review: Spec Pass, Quality Approved)
Task 2: complete (access_control refactored to use live resources directly, review: Spec Pass, Quality Approved)
Task 3: complete (main endpoints refactored to use live dashboard resources, review: Spec Pass, Quality Approved)
Task 4: complete (58 planned regression tests pass; FastAPI application imports cleanly; zero local MCP table/helper references in live backend paths)
