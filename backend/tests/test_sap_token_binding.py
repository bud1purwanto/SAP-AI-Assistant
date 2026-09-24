"""SAP bound-token table exists and CRUD works."""
import pathlib
import pytest
from fastapi import HTTPException
import json
from unittest.mock import patch, AsyncMock, MagicMock


def test_user_sap_tokens_table_in_migrations():
    """Migration file must reference user_sap_tokens table creation."""
    src = pathlib.Path(__file__).resolve().parent.parent / "migrations.py"
    assert "user_sap_tokens" in src.read_text(), "user_sap_tokens migration missing"


def test_save_and_get_sap_token():
    """Round-trip: save token encrypted, retrieve decrypted."""
    from database import save_user_sap_token, get_user_sap_token, delete_user_sap_token
    from datetime import datetime, timezone, timedelta
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    assert save_user_sap_token("test-tok-user", "dev", "tok_abc123", expires)
    result = get_user_sap_token("test-tok-user", "dev")
    assert result is not None
    assert result["token"] == "tok_abc123"
    # cleanup
    delete_user_sap_token("test-tok-user", "dev")


def test_get_client_sends_sap_token_header():
    """mcp_manager must reference X-SAP-Token header."""
    import inspect, mcp_manager as mm
    # Check the SAP credential forwarding section
    src = inspect.getsource(mm)
    assert "X-SAP-Token" in src, "mcp_manager must send X-SAP-Token when bound token available"


def test_bind_sap_token_endpoint_missing_target():
    """bind-token endpoint requires target."""
    import main
    from main import BindSapTokenRequest
    with pytest.raises(HTTPException) as exc_info:
        import asyncio
        asyncio.run(main.bind_sap_token(
            BindSapTokenRequest(target=""),
            user={"username": "testuser"}
        ))
    assert exc_info.value.status_code == 400


def test_bind_sap_token_endpoint_no_credential():
    """bind-token endpoint raises 404 if SAP credential not found."""
    import asyncio, main
    from main import BindSapTokenRequest
    with patch("database.get_user_sap_credential", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(main.bind_sap_token(
                BindSapTokenRequest(target="dev"),
                user={"username": "testuser"}
            ))
        assert exc_info.value.status_code == 404


def test_bind_sap_token_endpoint_no_dashboard_session():
    """bind-token endpoint raises 401 if dashboard access token missing."""
    import asyncio, main
    from main import BindSapTokenRequest
    with patch("database.get_user_sap_credential", return_value={"sap_user": "u", "sap_password": "p"}), \
         patch("auth.get_dashboard_access_token", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(main.bind_sap_token(
                BindSapTokenRequest(target="dev"),
                user={"username": "testuser"}
            ))
        assert exc_info.value.status_code == 401


def test_bind_sap_token_endpoint_upstream_fallback():
    """bind-token endpoint handles 404/501 gracefully with fallback."""
    import asyncio, main, httpx
    from main import BindSapTokenRequest

    mock_resp = MagicMock()
    mock_resp.status_code = 404

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post.return_value = mock_resp

    with patch("database.get_user_sap_credential", return_value={"sap_user": "u", "sap_password": "p", "sap_client": "100"}), \
         patch("auth.get_dashboard_access_token", return_value="fake-oidc-tok"), \
         patch("httpx.AsyncClient", return_value=mock_client):
        res = asyncio.run(main.bind_sap_token(
            BindSapTokenRequest(target="dev"),
            user={"username": "testuser"}
        ))
        assert res["success"] is True
        assert res["token_bound"] is False


def test_bind_sap_token_endpoint_success():
    """bind-token endpoint succeeds and saves bound token."""
    import asyncio, main, database
    from main import BindSapTokenRequest

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"token": "bound_sap_xyz", "expiresIn": 3600}

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post.return_value = mock_resp

    with patch("database.get_user_sap_credential", return_value={"sap_user": "u", "sap_password": "p", "sap_client": "100"}), \
         patch("auth.get_dashboard_access_token", return_value="fake-oidc-tok"), \
         patch("httpx.AsyncClient", return_value=mock_client), \
         patch.object(database, "save_user_sap_token") as mock_save:
        res = asyncio.run(main.bind_sap_token(
            BindSapTokenRequest(target="dev"),
            user={"username": "testuser"}
        ))
        assert res["success"] is True
        assert res["token_bound"] is True
        assert "expires_at" in res
        mock_save.assert_called_once()


def test_agent_need_sap_credential_guard():
    """agent.process_chat raises 428 NEED_SAP_CREDENTIAL when user has no credential/token."""
    import asyncio
    import agent
    import database
    from models import ChatRequest

    req = ChatRequest(message="cek stok", active_server="sap:unconfigured-target")
    with patch.object(database, "get_user_sap_credential", return_value=None), \
         patch.object(database, "get_user_sap_token", return_value=None), \
         patch.object(database, "list_user_sap_credentials", return_value=[]):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(agent.process_chat(req, user_role="user", user_persona="", username="nobind_user"))
        assert exc_info.value.status_code == 428
        payload = json.loads(exc_info.value.detail)
        assert payload.get("code") == "NEED_SAP_CREDENTIAL"
        assert payload.get("target") == "sap:unconfigured-target"
