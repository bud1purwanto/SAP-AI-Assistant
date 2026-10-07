import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import database
import main
import pytest
from fastapi import HTTPException


def test_oidc_user_mode_matrix_returns_modes_without_local_user_row():
    mode = SimpleNamespace(
        id=1, code="standard", name="Standard", description="", icon="zap",
        provider="9router", model="model", is_default=True, enabled=True,
        sort_order=0, max_iterations=15,
    )
    connection = MagicMock()
    connection.execute.return_value.fetchall.return_value = [mode]
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value = connection

    with patch.object(database, "get_engine", return_value=engine), \
         patch.object(database, "get_modes_for_role", return_value=[{"code": "standard", "available": True}]), \
         patch.object(database, "get_user_mode_overrides", return_value={}):
        result = database.get_user_modes_matrix("oidc-user-id", oidc_roles=["user"])

    assert "error" not in result
    assert len(result["modes"]) == 1
    assert result["modes"][0]["override_state"] == "inherit"
    assert result["modes"][0]["effective_allowed"] is True


def test_admin_matrix_endpoint_returns_directory_username():
    directory_user = {
        "id": "oidc-user-id", "username": "TRST-BUDI", "full_name": "Budi", "roles": ["user"]
    }
    with patch.object(main, "_oidc_mode_user", new=AsyncMock(return_value=directory_user)), \
         patch.object(main, "get_user_modes_matrix", return_value={"username": "TRST-BUDI", "modes": [{"code": "standard"}]}) as matrix:
        result = asyncio.run(main.get_admin_user_modes_matrix_endpoint("TRST-BUDI", admin={"username": "admin"}))

    matrix.assert_called_once_with("TRST-BUDI", oidc_roles=["user"])
    assert result["username"] == "TRST-BUDI"
    assert result["full_name"] == "Budi"
    assert len(result["modes"]) == 1


def test_admin_user_list_counts_existing_username_overrides():
    directory_users = [{
        "id": "oidc-user-id", "username": "TRST-BUDI", "full_name": "Budi",
        "role": "user", "roles": ["user"],
    }]
    with patch.object(main, "fetch_directory", new=AsyncMock(return_value=directory_users)), \
         patch.object(main, "get_all_user_mode_overrides", return_value=[{
             "username": "TRST-BUDI", "mode_code": "standard", "enabled": True,
         }]):
        result = asyncio.run(main.get_admin_modes_users_endpoint(admin={"dashboard_token": "token"}))

    assert result[0]["override_count"] == 1


def test_admin_save_uses_username_key_for_runtime_override():
    directory_user = {
        "id": "oidc-user-id", "username": "TRST-BUDI", "full_name": "Budi", "roles": ["user"]
    }
    req = main.AdminUpdateUserModeRequest(mode_code="standard", state="allow")
    with patch.object(main, "_oidc_mode_user", new=AsyncMock(return_value=directory_user)), \
         patch.object(main, "set_user_mode_override", return_value=True) as save, \
         patch.object(main, "get_user_modes_matrix", return_value={"modes": [{"code": "standard"}]}):
        result = asyncio.run(main.update_admin_user_modes_endpoint("TRST-BUDI", req, admin={"username": "admin"}))

    save.assert_called_once_with("TRST-BUDI", "standard", "allow")
    assert result["updated"] == 1


def test_admin_matrix_error_is_not_reported_as_empty_success():
    directory_user = {"id": "oidc-user-id", "username": "TRST-BUDI", "roles": ["user"]}
    with patch.object(main, "_oidc_mode_user", new=AsyncMock(return_value=directory_user)), \
         patch.object(main, "get_user_modes_matrix", return_value={"modes": [], "error": "database unavailable"}):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(main.get_admin_user_modes_matrix_endpoint("TRST-BUDI", admin={"username": "admin"}))

    assert exc.value.status_code == 500
