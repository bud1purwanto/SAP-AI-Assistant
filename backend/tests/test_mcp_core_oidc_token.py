"""Gateway inti harus menerima token OIDC pengguna, bukan token registry."""
from unittest.mock import patch

import pytest

from mcp_manager import MCPManager


@pytest.mark.parametrize("name", ["sap", "sql", "rag", "email"])
def test_core_gateway_uses_logged_in_user_token(name):
    manager = MCPManager()
    with patch.object(manager, "_get_client_config", return_value=(
        "http://gateway.example/v1/gateway",
        {"auth_token": "registry-token", "Authorization": "Bearer stale-token"},
    )), patch("auth.get_dashboard_access_token", return_value="trstdev-user-token"):
        client = manager.get_client(name)

    assert client.headers["Authorization"] == "Bearer trstdev-user-token"
    assert "auth_token" not in client.headers


@pytest.mark.parametrize("name", ["sap", "sql", "rag", "email"])
def test_core_gateway_rejects_missing_user_token_even_with_registry_token(name):
    manager = MCPManager()
    with patch.object(manager, "_get_client_config", return_value=(
        "http://gateway.example/v1/gateway", {"auth_token": "registry-token"},
    )), patch("auth.get_dashboard_access_token", return_value=None):
        with pytest.raises(PermissionError, match="Sesi OIDC pengguna"):
            manager.get_client(name)
