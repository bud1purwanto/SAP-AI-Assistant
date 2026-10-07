from unittest.mock import patch

from config import settings
from mcp_manager import MCPManager


def test_sap_uses_oidc_gateway_even_if_legacy_registry_url_exists():
    manager = MCPManager()
    with patch("database.get_mcp_server", return_value={
        "id": "sap", "enabled": True, "url": "http://legacy.example/mcp",
        "auth_token": "legacy-token",
    }):
        url, headers = manager._get_client_config("sap")

    assert url == settings.dashboard_mcp_gateway_url.rstrip("/")
    assert headers == {}
