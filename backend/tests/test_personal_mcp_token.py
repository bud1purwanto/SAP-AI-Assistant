"""Test resolusi token personal MCP per-user dari config_dashboard_db."""
from unittest.mock import patch
import pytest
from mcp_manager import MCPManager, resolve_user_mcp_token


def test_core_gateway_prefers_user_personal_token():
    manager = MCPManager()
    with patch.object(manager, "_get_client_config", return_value=(
        "http://gateway.example/v1/gateway",
        {"auth_token": "fallback-registry-token"},
    )), patch("auth.get_dashboard_user_id", return_value="00719130-6d35-4f71-8235-a792c16433d8"), \
       patch("auth.get_dashboard_access_token", return_value="user-oidc-jwt"), \
       patch("mcp_manager.resolve_user_mcp_token", return_value="budi-personal-token-123"):
        client = manager.get_client("email")

    assert client.headers["Authorization"] == "Bearer budi-personal-token-123"
    assert "auth_token" not in client.headers


def test_core_gateway_falls_back_to_oidc_jwt_if_no_personal_token():
    manager = MCPManager()
    with patch.object(manager, "_get_client_config", return_value=(
        "http://gateway.example/v1/gateway",
        {"auth_token": "fallback-registry-token"},
    )), patch("auth.get_dashboard_user_id", return_value="some-user-without-pat"), \
       patch("auth.get_dashboard_access_token", return_value="user-oidc-jwt"), \
       patch("mcp_manager.resolve_user_mcp_token", return_value=None):
        client = manager.get_client("email")

    assert client.headers["Authorization"] == "Bearer user-oidc-jwt"
    assert "auth_token" not in client.headers


def test_resolve_user_mcp_token_handles_empty_inputs():
    assert resolve_user_mcp_token(None, "email") is None
    assert resolve_user_mcp_token("", "email") is None
    assert resolve_user_mcp_token("user-1", "") is None
