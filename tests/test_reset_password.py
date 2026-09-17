"""Regression coverage for restored standalone password-management routes."""
from database import create_new_user


def test_standalone_password_routes_functional(client, admin_auth, db):
    username = "test_reset_user"
    create_new_user(username, "InitialPassword123!", role="user")

    # 1. Admin reset password
    admin_reset_res = client.post(
        f"/api/admin/users/{username}/reset-password",
        json={"new_password": "TempPassword123!", "force_change": True},
        headers=admin_auth,
    )
    assert admin_reset_res.status_code == 200
    assert admin_reset_res.json().get("success") is True

    # 2. Login with temp password
    login_res = client.post(
        "/api/login",
        json={"username": username, "password": "TempPassword123!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    user_auth = {"Authorization": f"Bearer {token}"}

    # 3. User change password
    change_res = client.post(
        "/api/change-password",
        json={"old_password": "TempPassword123!", "new_password": "NewPassword123!"},
        headers=user_auth,
    )
    assert change_res.status_code == 200
    assert change_res.json().get("status") == "success"

    # 4. Verify login with new password
    new_login_res = client.post(
        "/api/login",
        json={"username": username, "password": "NewPassword123!"},
    )
    assert new_login_res.status_code == 200
