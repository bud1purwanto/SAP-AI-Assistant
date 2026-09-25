import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi import HTTPException
import asyncio

from main import (
    get_available_mcp_access_requests,
    submit_mcp_access_request,
    get_my_mcp_access_requests,
    RequestMcpAccessPayload,
)


def test_access_requests_available_proxy():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [
        {"connectionId": "conn-1", "name": "dev-223", "accessState": "locked"}
    ]

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.get.return_value = mock_resp

    with patch("auth.get_dashboard_access_token", return_value="fake-token"), \
         patch("httpx.AsyncClient", return_value=mock_client):
        res = asyncio.run(
            get_available_mcp_access_requests(user={"username": "test-user", "access_token": "fake-token"})
        )
        assert len(res) == 1
        assert res[0]["name"] == "dev-223"
        assert res[0]["accessState"] == "locked"


def test_access_requests_submit_proxy():
    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.json.return_value = {
        "id": "req-1",
        "connectionId": "conn-1",
        "status": "pending",
    }

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post.return_value = mock_resp

    with patch("auth.get_dashboard_access_token", return_value="fake-token"), \
         patch("httpx.AsyncClient", return_value=mock_client):
        res = asyncio.run(
            submit_mcp_access_request(
                RequestMcpAccessPayload(connectionId="conn-1", reason="Testing"),
                user={"username": "test-user", "access_token": "fake-token"},
            )
        )
        assert res["id"] == "req-1"
        assert res["status"] == "pending"


def test_my_access_requests_proxy():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [{"id": "req-1", "status": "pending"}]
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.get.return_value = mock_resp

    with patch("httpx.AsyncClient", return_value=mock_client):
        res = asyncio.run(
            get_my_mcp_access_requests(user={"username": "test-user", "access_token": "fake-token"})
        )
        assert res == [{"id": "req-1", "status": "pending"}]


def test_access_requests_no_session_raises_401():
    with patch("auth.get_dashboard_access_token", return_value=None):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(
                get_available_mcp_access_requests(user={"username": "guest", "access_token": None, "dashboard_token": None})
            )
        assert exc.value.status_code == 401
