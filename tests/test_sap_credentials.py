import pytest
from unittest.mock import patch, AsyncMock
import database


def test_save_and_edit_user_sap_credential_preserves_password(db):
    username = "test_user_cred"
    target = "sandbox-new"
    
    # 1. New credential requires password
    ok_empty = database.save_user_sap_credential(username, target, "SAPUSER", "")
    assert ok_empty is False

    # 2. Save with password
    ok = database.save_user_sap_credential(username, target, "SAPUSER", "Secret123", "130")
    assert ok is True

    saved = database.get_user_sap_credential(username, target)
    assert saved is not None
    assert saved["sap_user"] == "SAPUSER"
    assert saved["sap_password"] == "Secret123"
    assert saved["sap_client"] == "130"

    # 3. Edit credential without providing password -> preserves Secret123
    ok_edit = database.save_user_sap_credential(username, target, "NEW_SAPUSER", "", "140")
    assert ok_edit is True

    updated = database.get_user_sap_credential(username, target)
    assert updated is not None
    assert updated["sap_user"] == "NEW_SAPUSER"
    assert updated["sap_password"] == "Secret123"  # Preserved!
    assert updated["sap_client"] == "140"

    # Clean up
    database.delete_user_sap_credential(username, target)


def test_available_sap_servers_endpoint(db, client, admin_auth):
    resp = client.get("/api/me/sap-credentials/available-servers", headers=admin_auth)
    assert resp.status_code == 200
    data = resp.json()
    assert "servers" in data
    assert "saved_targets" in data
    assert isinstance(data["servers"], list)


def test_test_sap_credential_endpoint_validation(db, client, admin_auth):
    # Missing target
    resp = client.post("/api/me/sap-credentials/test", json={
        "target": "",
        "sap_user": "TEST",
        "sap_password": "PWD"
    }, headers=admin_auth)
    assert resp.status_code == 400

    # Missing password for unsaved target
    resp = client.post("/api/me/sap-credentials/test", json={
        "target": "sandbox-new",
        "sap_user": "TEST",
        "sap_password": ""
    }, headers=admin_auth)
    assert resp.status_code == 400
    assert "Password SAP wajib diisi" in resp.json()["detail"]


def test_test_sap_credential_endpoint_real_rejection(db, client, admin_auth):
    # Testing with nonexistent user returns success: False with helpful reason
    resp = client.post("/api/me/sap-credentials/test", json={
        "target": "dev",
        "sap_user": "NONEXISTENT_USER_999",
        "sap_password": "WRONG_PASSWORD_XYZ",
        "sap_client": "130"
    }, headers=admin_auth)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert "tidak terdaftar" in data["message"] or "gagal" in data["message"].lower()


def test_test_sap_credential_endpoint_wrong_password(db, client, admin_auth):
    # Testing with real user TRST-BUDI but wrong password returns success: False
    resp = client.post("/api/me/sap-credentials/test", json={
        "target": "dev",
        "sap_user": "TRST-BUDI",
        "sap_password": "WRONG_PASSWORD_XYZ",
        "sap_client": "130"
    }, headers=admin_auth)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert "tidak sesuai" in data["message"] or "terkunci" in data["message"].lower() or "gagal" in data["message"].lower()




def test_duplicate_target_prevention(db, client, admin_auth):
    target = "sandbox-test-dup"
    # First save
    resp = client.post("/api/me/sap-credentials", json={
        "target": target,
        "sap_user": "USER1",
        "sap_password": "PWD",
        "sap_client": "100",
        "is_update": False
    }, headers=admin_auth)
    assert resp.status_code == 200

    # Second save with is_update=False should be rejected as duplicate
    resp_dup = client.post("/api/me/sap-credentials", json={
        "target": target,
        "sap_user": "USER2",
        "sap_password": "PWD",
        "sap_client": "100",
        "is_update": False
    }, headers=admin_auth)
    assert resp_dup.status_code == 400
    assert "sudah tersimpan" in resp_dup.json()["detail"]

    # Save with is_update=True should succeed
    resp_update = client.post("/api/me/sap-credentials", json={
        "target": target,
        "sap_user": "USER2",
        "sap_password": "",  # preserve old password
        "sap_client": "200",
        "is_update": True
    }, headers=admin_auth)
    assert resp_update.status_code == 200

    # Clean up
    client.delete(f"/api/me/sap-credentials/{target}", headers=admin_auth)

