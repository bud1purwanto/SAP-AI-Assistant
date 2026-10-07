from unittest.mock import patch

import pytest

from mcp_registry import mcp_control_plane_base


def test_control_plane_uses_registered_gateway_host_and_path_prefix():
    with patch("database.get_mcp_server", return_value={
        "enabled": True,
        "url": "https://dashboard.example/app/v1/gateway/mcp-sap",
    }):
        assert mcp_control_plane_base("sap") == "https://dashboard.example/app"


def test_control_plane_requires_enabled_server():
    with patch("database.get_mcp_server", return_value=None):
        with pytest.raises(RuntimeError):
            mcp_control_plane_base("sap")
