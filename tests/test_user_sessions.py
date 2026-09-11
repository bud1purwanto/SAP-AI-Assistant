"""Pengujian manajemen sesi pengguna, anti-multiple logon (single-session enforcement),
heartbeat telemetri, pemutusan sesi oleh admin (kick), dan log audit autentikasi.
"""
import pytest
from conftest import ADMIN_PASSWORD, ADMIN_USER


def test_login_creates_session_and_audit_log(client, make_user):
    username = "session_test_user_1"
    auth = make_user(username, password="Password123!")

    # Cek bahwa audit log admin mencatat login sukses
    admin_login = client.post("/api/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    admin_token = admin_login.json()["access_token"]
    admin_auth = {"Authorization": f"Bearer {admin_token}"}

    sec_res = client.get(f"/api/admin/security-logs?username={username}", headers=admin_auth)
    assert sec_res.status_code == 200
    logs = sec_res.json()["logs"]
    assert any(log["event_type"] == "LOGIN_SUCCESS" for log in logs)

    # Cek bahwa sesi muncul di daftar sesi admin
    sess_res = client.get(f"/api/admin/user-sessions?q={username}", headers=admin_auth)
    assert sess_res.status_code == 200
    sessions = sess_res.json()["sessions"]
    assert any(s["username"] == username and s["is_active"] for s in sessions)


def test_anti_multiple_logon_kicks_first_session(client):
    username = "session_concurrent_user"
    password = "Password123!"

    # Dapatkan admin token
    admin_login = client.post("/api/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    admin_auth = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # Buat user
    client.post("/api/admin/users", json={"username": username, "password": password, "role": "user"}, headers=admin_auth)

    try:
        # 1. Login dari Device 1 (PC)
        res1 = client.post("/api/login", json={
            "username": username,
            "password": password,
            "device_name": "PC Kantor (Chrome)",
            "device_type": "desktop",
            "os": "Windows",
            "browser": "Chrome",
        })
        assert res1.status_code == 200
        token1 = res1.json()["access_token"]
        auth1 = {"Authorization": f"Bearer {token1}"}

        # Device 1 bisa akses /api/me
        me1 = client.get("/api/me", headers=auth1)
        assert me1.status_code == 200

        # 2. Login dari Device 2 (HP)
        res2 = client.post("/api/login", json={
            "username": username,
            "password": password,
            "device_name": "iPhone (Safari)",
            "device_type": "mobile",
            "os": "iOS",
            "browser": "Safari",
        })
        assert res2.status_code == 200
        token2 = res2.json()["access_token"]
        auth2 = {"Authorization": f"Bearer {token2}"}

        # 3. Verifikasi: Device 1 sekarang harus ter-kick (401 SESSION_KICKED)
        me_kicked = client.get("/api/me", headers=auth1)
        assert me_kicked.status_code == 401
        detail = me_kicked.json().get("detail", {})
        if isinstance(detail, dict):
            assert detail.get("code") == "SESSION_KICKED"
            assert "perangkat lain" in detail.get("reason", "").lower()

        # Heartbeat Device 1 juga harus mengembalikan 401 SESSION_KICKED
        hb_kicked = client.post("/api/auth/heartbeat", json={"current_action": "Mengetik"}, headers=auth1)
        assert hb_kicked.status_code == 401

        # 4. Device 2 tetap aktif
        me2 = client.get("/api/me", headers=auth2)
        assert me2.status_code == 200

    finally:
        client.delete(f"/api/admin/users/{username}", headers=admin_auth)


def test_admin_kick_user_session(client):
    username = "session_admin_kick_user"
    password = "Password123!"

    admin_login = client.post("/api/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    admin_auth = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    client.post("/api/admin/users", json={"username": username, "password": password, "role": "user"}, headers=admin_auth)

    try:
        user_res = client.post("/api/login", json={
            "username": username,
            "password": password,
            "device_name": "Laptop Pengguna",
        })
        assert user_res.status_code == 200
        session_id = user_res.json()["session_id"]
        user_token = user_res.json()["access_token"]
        user_auth = {"Authorization": f"Bearer {user_token}"}

        # Pastikan user aktif
        assert client.get("/api/me", headers=user_auth).status_code == 200

        # Admin kick sesi tersebut
        kick_res = client.post(f"/api/admin/user-sessions/{session_id}/kick", json={"reason": "Audit mendadak"}, headers=admin_auth)
        assert kick_res.status_code == 200
        assert kick_res.json()["status"] == "success"

        # User sekarang ter-kick
        kicked_req = client.get("/api/me", headers=user_auth)
        assert kicked_req.status_code == 401
        detail = kicked_req.json().get("detail", {})
        if isinstance(detail, dict):
            assert detail.get("code") == "SESSION_KICKED"
            assert "Audit mendadak" in detail.get("reason", "") or "Administrator" in detail.get("reason", "")

    finally:
        client.delete(f"/api/admin/users/{username}", headers=admin_auth)


def test_heartbeat_updates_activity(client):
    username = "session_hb_user"
    password = "Password123!"

    admin_login = client.post("/api/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    admin_auth = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    client.post("/api/admin/users", json={"username": username, "password": password, "role": "user"}, headers=admin_auth)

    try:
        user_res = client.post("/api/login", json={"username": username, "password": password})
        user_auth = {"Authorization": f"Bearer {user_res.json()['access_token']}"}

        # Kirim heartbeat
        hb = client.post("/api/auth/heartbeat", json={
            "current_action": "Melihat Laporan Keuangan SAP",
            "current_path": "/chat",
            "is_idle": False,
        }, headers=user_auth)
        assert hb.status_code == 200
        assert hb.json()["status"] == "ok"

        # Periksa sesi di admin
        admin_sess = client.get(f"/api/admin/user-sessions?q={username}", headers=admin_auth)
        assert admin_sess.status_code == 200
        sess_data = admin_sess.json()["sessions"]
        matched = [s for s in sess_data if s["username"] == username]
        assert len(matched) > 0
        assert matched[0]["current_action"] == "Melihat Laporan Keuangan SAP"

    finally:
        client.delete(f"/api/admin/users/{username}", headers=admin_auth)


def test_logout_terminates_session(client):
    username = "session_logout_user"
    password = "Password123!"

    admin_login = client.post("/api/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    admin_auth = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    client.post("/api/admin/users", json={"username": username, "password": password, "role": "user"}, headers=admin_auth)

    try:
        user_res = client.post("/api/login", json={"username": username, "password": password})
        user_auth = {"Authorization": f"Bearer {user_res.json()['access_token']}"}

        # Logout
        logout_res = client.post("/api/logout", headers=user_auth)
        assert logout_res.status_code == 200

        # Cek status sesi di admin
        admin_sess = client.get(f"/api/admin/user-sessions?status=all&q={username}", headers=admin_auth)
        assert admin_sess.status_code == 200
        sess_data = admin_sess.json()["sessions"]
        matched = [s for s in sess_data if s["username"] == username]
        assert len(matched) > 0
        assert matched[0]["status"] == "logged_out"
        assert not matched[0]["is_active"]

    finally:
        client.delete(f"/api/admin/users/{username}", headers=admin_auth)
