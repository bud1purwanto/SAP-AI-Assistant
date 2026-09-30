"""SAP credential failures must be distinct from MCP permission failures."""

import httpx
import pytest

from agent import _raise_if_sap_credential_rejected
from mcp_manager import MCPCallResult, MCPContentItem, SapCredentialRejected, is_sap_credential_error, sap_error_text


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
