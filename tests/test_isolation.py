"""Isolasi data antar user: sesi, pesan, dan berkas hasil generate."""


def test_user_cannot_read_another_users_messages(client, make_user, db):
    alice = make_user("isol_alice")
    bob = make_user("isol_bob")

    session_id = client.post("/api/sessions", json={"title": "Rahasia"}, headers=alice).json()["session_id"]
    db.add_chat_message(session_id, "user", "data gaji rahasia")

    assert client.get(f"/api/sessions/{session_id}/messages", headers=bob).json() == []
    assert len(client.get(f"/api/sessions/{session_id}/messages", headers=alice).json()) == 1


def test_user_cannot_delete_another_users_session(client, make_user):
    alice = make_user("del_alice")
    bob = make_user("del_bob")
    session_id = client.post("/api/sessions", json={"title": "Milik Alice"}, headers=alice).json()["session_id"]

    assert client.delete(f"/api/sessions/{session_id}", headers=bob).status_code == 404
    assert client.delete(f"/api/sessions/{session_id}", headers=alice).status_code == 200


def test_chat_rejects_session_owned_by_someone_else(client, make_user):
    alice = make_user("own_alice")
    bob = make_user("own_bob")
    session_id = client.post("/api/sessions", json={"title": "Milik Alice"}, headers=alice).json()["session_id"]

    res = client.post("/api/chat", json={"message": "halo", "session_id": session_id}, headers=bob)
    assert res.status_code == 404


def test_sessions_list_only_shows_own_sessions(client, make_user):
    alice = make_user("list_alice")
    bob = make_user("list_bob")
    client.post("/api/sessions", json={"title": "Punya Alice"}, headers=alice)

    titles = [s["title"] for s in client.get("/api/sessions", headers=bob).json()]
    assert "Punya Alice" not in titles


def test_provider_api_keys_never_sent_to_normal_users(client, make_user, admin_auth):
    user = make_user("cfg_user")
    assert "nine_router_api_key" not in client.get("/api/config", headers=user).json()

    admin_cfg = client.get("/api/config", headers=admin_auth).json()
    key = admin_cfg.get("nine_router_api_key", "")
    assert key == "" or "••••" in key, "API key superadmin harus termasker"
