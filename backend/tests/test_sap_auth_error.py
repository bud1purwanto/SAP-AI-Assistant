"""SAP credential failures must be distinct from MCP permission failures."""

import httpx
import pytest
import asyncio
from unittest.mock import AsyncMock, patch

from agent import _raise_if_sap_credential_rejected
from auth import set_dashboard_access_token
from mcp_manager import MCPCallResult, MCPContentItem, MCPManager, SapCredentialRejected, is_sap_credential_error, sap_error_text


def test_invalid_sap_credentials_raise_dedicated_error():
    result = MCPCallResult([MCPContentItem('RFC_ERROR_LOGON_FAILURE: Invalid credentials')], is_error=True)
    with pytest.raises(SapCredentialRejected):
        _raise_if_sap_credential_rejected('sap', result)


def test_permission_denial_does_not_ask_for_sap_password():
    result = MCPCallResult([MCPContentItem('Access denied: user does not have permission for this server')], is_error=True)
    _raise_if_sap_credential_rejected('sap', result)
    assert not is_sap_credential_error(result.content[0].text)


def test_other_mcp_error_does_not_open_sap_credentials():
    result = MCPCallResult([MCPContentItem('Invalid credentials')], is_error=True)
    _raise_if_sap_credential_rejected('sql', result)


def test_http_error_body_can_identify_sap_logon_failure():
    request = httpx.Request('POST', 'http://mcp.example/gateway')
    response = httpx.Response(401, text='RFC_ERROR_LOGON_FAILURE: Invalid credentials', request=request)
    error = httpx.HTTPStatusError('gateway rejected request', request=request, response=response)
    assert is_sap_credential_error(sap_error_text(error))


def test_sap_tool_forwards_bound_token_to_target_and_execution():
    manager = MCPManager()
    result = MCPCallResult([MCPContentItem('{"success": true}')])
    with patch.object(manager, "_set_active_sap_server_unlocked", new_callable=AsyncMock, return_value=True) as select, \
         patch.object(manager, "_handle_sap_call", new_callable=AsyncMock, return_value=result) as execute, \
         patch.object(manager, "get_client", return_value=object()):
        actual = asyncio.run(manager.call_tool("sap", "read_table", {"table_name": "MARA"},
                                               sap_target="dev", sap_credentials={"sap_token": "bound"}))
    assert actual is result
    assert select.call_args.kwargs["extra_headers"]["X-SAP-Token"] == "bound"
    assert execute.call_args.kwargs["extra_headers"]["X-SAP-Token"] == "bound"


def test_sap_client_uses_user_oidc_jwt_even_if_registry_has_service_token():
    manager = MCPManager()
    set_dashboard_access_token("user-jwt")
    try:
        with patch.object(manager, "_get_client_config", return_value=(
            "https://mcp.example/gateway", {"auth_token": "service-token"},
        )):
            client = manager.get_client("sap")
        assert client.headers["Authorization"] == "Bearer user-jwt"
    finally:
        set_dashboard_access_token(None)
