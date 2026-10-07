"""Kredensial SAP pribadi memakai Dashboard OIDC sebagai sumber tunggal."""

import asyncio
import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException

import main
import oidc_sap_credentials as oidc


USER = {"sub": "oidc-user-id", "username": "alice", "dashboard_token": "user-jwt"}
STATUSES = [
    {"connectionId": "conn-dev", "resourceKey": "sap:dev", "aliases": ["dev", "dev-aix"],
     "configured": True, "username": "SAP_ALICE"},
    {"connectionId": "conn-qa", "resourceKey": "sap:qa", "aliases": ["qa"],
     "configured": False, "username": None},
]


def test_oidc_status_lists_only_saved_credentials_without_password():
    saved = oidc.saved_credentials(STATUSES)
    assert saved == [{"target": "dev", "connection_id": "conn-dev",
                      "display_name": "", "sap_user": "SAP_ALICE", "updated_at": None}]
    assert oidc.resolve_connection_id(STATUSES, "dev-aix") == "conn-dev"
    assert oidc.resolve_connection_id(STATUSES, "qa") == "conn-qa"


def test_sap_credential_list_reads_oidc_only():
    with patch.object(oidc, "list_status", new_callable=AsyncMock, return_value=STATUSES) as listing:
        result = asyncio.run(main.get_my_sap_credentials(user=USER))
    assert result[0]["sap_user"] == "SAP_ALICE"
    listing.assert_awaited_once_with(USER)


def test_sap_credential_save_uses_oidc_connection_id():
    with patch.object(oidc, "list_status", new_callable=AsyncMock, return_value=STATUSES), \
         patch.object(oidc, "save", new_callable=AsyncMock) as save, \
         patch("database.save_user_sap_token") as cache:
        result = asyncio.run(main.save_my_sap_credential(
            main.UserSapCredentialRequest(target="qa", sap_user="SAP_ALICE", sap_password="secret"),
            user=USER,
        ))
    assert result["success"] is True
    save.assert_awaited_once_with(USER, "conn-qa", "SAP_ALICE", "secret")
    cache.assert_not_called()


def test_sap_credential_update_keeps_password_at_oidc():
    with patch.object(oidc, "list_status", new_callable=AsyncMock, return_value=STATUSES), \
         patch.object(oidc, "save", new_callable=AsyncMock) as save:
        asyncio.run(main.save_my_sap_credential(
            main.UserSapCredentialRequest(target="dev", sap_user="SAP_ALICE", is_update=True),
            user=USER,
        ))
    save.assert_awaited_once_with(USER, "conn-dev", "SAP_ALICE", None)


def test_existing_oidc_credential_does_not_require_local_bound_token():
    with patch.object(oidc, "list_status", new_callable=AsyncMock, return_value=STATUSES), \
         patch.object(oidc, "save", new_callable=AsyncMock) as save, \
         patch("database.get_user_sap_token") as cache:
        asyncio.run(main.save_my_sap_credential(
            main.UserSapCredentialRequest(target="dev", sap_user="SAP_ALICE", is_update=True), user=USER,
        ))
    save.assert_awaited_once_with(USER, "conn-dev", "SAP_ALICE", None)
    cache.assert_not_called()


def test_sap_credential_delete_uses_oidc_connection_id():
    with patch.object(oidc, "list_status", new_callable=AsyncMock, return_value=STATUSES), \
         patch.object(oidc, "delete", new_callable=AsyncMock) as delete, \
         patch("database.delete_user_sap_token") as clear:
        result = asyncio.run(main.delete_my_sap_credential("dev", user=USER))
    assert result["success"] is True
    delete.assert_awaited_once_with(USER, "conn-dev")
    clear.assert_called_once_with("oidc-user-id", "conn-dev")


def test_oidc_http_contract_uses_user_jwt_and_expected_methods(monkeypatch):
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path, request.headers.get("authorization"), request.content))
        if request.method == "GET":
            return httpx.Response(200, json={"connections": STATUSES})
        return httpx.Response(200, json={"success": True})

    client_type = httpx.AsyncClient
    monkeypatch.setattr(oidc.httpx, "AsyncClient",
                        lambda **kwargs: client_type(transport=httpx.MockTransport(handler)))
    assert asyncio.run(oidc.list_status(USER)) == STATUSES
    asyncio.run(oidc.save(USER, "conn-dev", "SAP_ALICE", "secret"))
    asyncio.run(oidc.delete(USER, "conn-dev"))

    assert [(method, path) for method, path, _, _ in calls] == [
        ("GET", "/v1/mcp/sap-credentials/mine"),
        ("PUT", "/v1/mcp/sap-credentials/conn-dev"),
        ("DELETE", "/v1/mcp/sap-credentials/conn-dev"),
    ]
    assert all(authorization == "Bearer user-jwt" for _, _, authorization, _ in calls)
    assert json.loads(calls[1][3]) == {"username": "SAP_ALICE", "password": "secret"}


def test_oidc_uuid_is_enriched_with_human_target_name(monkeypatch):
    connection_id = "cd30606b-2ad1-4483-a5d0-f35037a126e3"

    def handler(request):
        if request.url.path.endswith("/mine"):
            return httpx.Response(200, json=[{
                "connectionId": connection_id, "target": connection_id,
                "configured": True, "username": "SAP_ALICE",
            }])
        return httpx.Response(200, json={"targets": [{
            "connectionId": connection_id, "resourceKey": "sap:dev",
            "name": "Development AIX",
        }]})

    client_type = httpx.AsyncClient
    monkeypatch.setattr(oidc.httpx, "AsyncClient",
                        lambda **kwargs: client_type(transport=httpx.MockTransport(handler)))
    rows = asyncio.run(oidc.list_status(USER))
    saved = oidc.saved_credentials(rows)
    assert saved[0]["target"] == "dev"
    assert saved[0]["display_name"] == "Development AIX"
    assert oidc.resolve_connection_id(rows, "dev") == connection_id


def test_available_sap_server_matches_enriched_oidc_connection():
    rows = [{"connectionId": "conn-dev", "resourceKey": "sap:dev",
             "accessName": "Development AIX", "configured": True, "username": "SAP_ALICE"}]
    resources = [{"kind": "sap", "resource_key": "sap:dev", "label": "Development AIX",
                  "aliases": ["dev", "dev-aix"], "sid": "DEV"}]
    with patch.object(oidc, "list_status", new_callable=AsyncMock, return_value=rows), \
         patch.object(oidc, "list_sap_resources", new_callable=AsyncMock, return_value=resources):
        result = asyncio.run(main.get_available_sap_servers_endpoint(user=USER))
    assert result["servers"][0]["name"] == "Development AIX"
    assert result["servers"][0]["connection_id"] == "conn-dev"
    assert result["servers"][0]["has_credential"] is True


def test_sap_credential_rejects_missing_oidc_subject():
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.get_my_sap_credentials(user={"username": "legacy-user"}))
    assert error.value.status_code == 401


def test_old_local_bind_endpoint_cannot_restore_local_fallback():
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.bind_sap_token(main.BindSapTokenRequest(target="dev"), user=USER))
    assert error.value.status_code == 410


def test_agent_missing_oidc_credential_opens_sap_login():
    import agent
    from models import ChatRequest

    req = ChatRequest(message="cek stok", active_server="sap:unconfigured-target")
    with patch.object(oidc, "list_status", new_callable=AsyncMock, return_value=[]):
        with pytest.raises(HTTPException) as error:
            asyncio.run(agent.process_chat(req, user_role="user", user_persona="",
                                           username="alice", oidc_sub="oidc-user-id"))
    assert error.value.status_code == 428
    assert json.loads(error.value.detail)["code"] == "NEED_SAP_CREDENTIAL"
