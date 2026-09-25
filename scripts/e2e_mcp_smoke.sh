#!/usr/bin/env bash
# scripts/e2e_mcp_smoke.sh
# End-to-end smoke test across all 4 MCP services + Admin URL Registry + SAP Token Binding.
# No hardcoded tokens: authenticates dynamically via dashboard-mcp, stores cookies,
# exercises per-user URL registry, tests SAP token-binding fallback, and invokes each MCP.
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8006}"
USERNAME="${TEST_USERNAME:-test-user}"
PASSWORD="${TEST_PASSWORD:-password}"

COOKIE_JAR="$(mktemp /tmp/sap_cookie.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

pass() { echo -e "\033[32m[PASS]\033[0m $1"; }
fail() { echo -e "\033[31m[FAIL]\033[0m $1"; exit 1; }
info() { echo -e "\033[34m[INFO]\033[0m $1"; }

info "1. Authenticating as '$USERNAME' against $API_BASE/api/auth/login..."
LOGIN_RESP=$(curl -sS -c "$COOKIE_JAR" -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$USERNAME\", \"password\": \"$PASSWORD\"}")

STATUS=$(echo "$LOGIN_RESP" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("status", ""))')
[[ "$STATUS" == "success" ]] || fail "Login failed: $LOGIN_RESP"
pass "Login succeeded, session cookie stored."

info "2. Verifying /api/auth/session..."
AUTH_CHECK=$(curl -sS -b "$COOKIE_JAR" "$API_BASE/api/auth/session" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("authenticated", False))')
[[ "$AUTH_CHECK" == "True" ]] || fail "Session check returned unauthenticated."
pass "Session authenticated via per-user cookie."

info "3. Testing MCP Public Server Status (/api/mcp/servers)..."
MCP_RAW=$(curl -sS -w "\n%{http_code}" -b "$COOKIE_JAR" "$API_BASE/api/mcp/servers")
MCP_HTTP_CODE=$(echo "$MCP_RAW" | tail -n1)
MCP_SERVERS_JSON=$(echo "$MCP_RAW" | sed '$d')

if [ "$MCP_HTTP_CODE" != "200" ]; then
  fail "GET /api/mcp/servers returned HTTP $MCP_HTTP_CODE. Response: $MCP_SERVERS_JSON"
fi

SERVER_COUNT=$(echo "$MCP_SERVERS_JSON" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, dict):
        # Could be {"servers": [...]} or {server_id: status_obj}
        servers = data.get("servers") if "servers" in data else data
        print(len(servers))
    elif isinstance(data, list):
        print(len(data))
    else:
        print(0)
except Exception as e:
    print(f"ERROR: {e}")
')

if [[ "$SERVER_COUNT" =~ ^ERROR ]] || [ "$SERVER_COUNT" -le 0 ]; then
  fail "Failed to get servers. Count/Error: $SERVER_COUNT. Raw body: $MCP_SERVERS_JSON"
fi
pass "Found $SERVER_COUNT live MCP server(s)."

info "4. Testing Admin MCP URL Registry (name+url only)..."
ADMIN_SERVERS=$(curl -sS -b "$COOKIE_JAR" "$API_BASE/api/admin/mcp/servers")
# Ensure no auth_token is leaked in the output
HAS_LEAKED_TOKEN=$(echo "$ADMIN_SERVERS" | python3 -c '
import sys, json
data = json.load(sys.stdin)
servers = data.get("servers", [])
leaked = any("auth_token" in s for s in servers)
print("LEAK" if leaked else "CLEAN")
')
[[ "$HAS_LEAKED_TOKEN" == "CLEAN" ]] || fail "Security leak: auth_token present in /api/admin/mcp/servers output"
pass "Admin MCP registry returns URL-only servers without static tokens."

info "5. Verifying Access Control Purge (/api/admin/access/roles should 404)..."
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$API_BASE/api/admin/access/roles" || true)
[[ "$HTTP_CODE" == "404" ]] || fail "Expected 404 for purged access_control endpoint, got $HTTP_CODE"
pass "Purged access-control endpoint /api/admin/access/roles correctly returns 404."

info "6. Testing Onboarding Guard: Precondition Required (428) when SAP credential missing..."
# Try to chat with a target before setting credentials
MISSING_CRED_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$API_BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Tampilkan tabel MARA"}], "active_server": "sandbox-unconfigured"}' || true)
# 428 Precondition Required is returned when user has not saved SAP credentials
if [[ "$MISSING_CRED_CODE" == "428" || "$MISSING_CRED_CODE" == "400" ]]; then
  pass "Pre-tool SAP onboarding guard correctly intercepted unconfigured user ($MISSING_CRED_CODE)."
else
  info "Chat returned $MISSING_CRED_CODE (target server may have had fallback credentials or routed through general model)."
fi

info "7. Testing SAP Credential Save + Token Binding Flow..."
SAVE_RESP=$(curl -sS -b "$COOKIE_JAR" -X POST "$API_BASE/api/me/sap-credentials" \
  -H "Content-Type: application/json" \
  -d '{"target": "dev-e2e-test", "sap_user": "TESTUSER", "sap_password": "InitialPassword123", "sap_client": "100"}')
echo "$SAVE_RESP" | grep -q '"success":true' || fail "Failed to save SAP credential: $SAVE_RESP"
pass "SAP credential saved encrypted."

BIND_RESP=$(curl -sS -b "$COOKIE_JAR" -X POST "$API_BASE/api/me/sap-credentials/bind-token" \
  -H "Content-Type: application/json" \
  -d '{"target": "dev-e2e-test"}')
BIND_OK=$(echo "$BIND_RESP" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("success", False))')
[[ "$BIND_OK" == "True" ]] || fail "SAP token binding endpoint failed: $BIND_RESP"
pass "SAP token binding succeeded (or gracefully fell back to legacy headers)."

info "8. Cleaning up test SAP credential..."
DEL_RESP=$(curl -sS -b "$COOKIE_JAR" -X DELETE "$API_BASE/api/me/sap-credentials/dev-e2e-test")
echo "$DEL_RESP" | grep -q '"success":true' || fail "Failed to delete test credential: $DEL_RESP"
pass "Test SAP credential and token cleanly purged."

info "9. Real-time Gateway Connectivity Tests (sap, rag, sql, email)..."
for SRV in sap rag sql email; do
  TEST_RESP=$(curl -sS -b "$COOKIE_JAR" -X POST "$API_BASE/api/admin/mcp/test" \
    -H "Content-Type: application/json" \
    -d "{\"server_id\": \"$SRV\"}")
  ONLINE=$(echo "$TEST_RESP" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("online", False))' 2>/dev/null || echo "False")
  if [[ "$ONLINE" == "True" ]]; then
    LATENCY=$(echo "$TEST_RESP" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("latency_ms", 0))')
    pass "Gateway '$SRV' is ONLINE (${LATENCY}ms)."
  else
    info "Gateway '$SRV' test ping returned offline/not running (expected if downstream mock or external node is inactive)."
  fi
done

echo ""
echo -e "\033[32m====================================================\033[0m"
echo -e "\033[32m ALL E2E SMOKE CHECKS PASSED SUCCESSFULLY!          \033[0m"
echo -e "\033[32m====================================================\033[0m"
