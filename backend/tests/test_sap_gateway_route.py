from unittest.mock import patch

import pytest

from mcp_manager import MCPManager


def test_sap_uses_enabled_registry_url():
    manager = MCPManager()
    with patch("database.get_mcp_server", return_value={
        "id": "sap", "enabled": True, "url": "http://dashboard.example/v1/gateway/mcp-sap",
        "auth_token": "legacy-token",
    }):
        url, headers = manager._get_client_config("sap")

    assert url == "http://dashboard.example/v1/gateway/mcp-sap"
    assert headers == {"auth_token": "legacy-token"}


@pytest.mark.parametrize("registered", [None, {"id": "sap", "enabled": False, "url": "http://old.example/mcp"}])
def test_sap_never_falls_back_to_static_gateway(registered):
    manager = MCPManager()
    with patch("database.get_mcp_server", return_value=registered), \
         patch("database.list_mcp_servers", return_value=[]):
        with pytest.raises(RuntimeError):
            manager._get_client_config("sap")
