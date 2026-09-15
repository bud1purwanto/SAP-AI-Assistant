"""Regression coverage for removed local password-management routes."""


def test_local_password_routes_removed(client, admin_auth, make_user):
    username = "test_reset_user"
    user_auth = make_user(username)

    assert client.post(
        f"/api/admin/users/{username}/reset-password",
        json={"password": "TempPassword123", "force_change_password": True},
        headers=admin_auth,
    ).status_code == 404
    assert client.post(
        "/api/change-password",
        json={"old_password": "OldPassword123", "new_password": "NewPassword123"},
        headers=user_auth,
    ).status_code == 404
    assert client.post(
        "/api/login",
        json={"username": username, "password": "TempPassword123"},
    ).status_code == 404
