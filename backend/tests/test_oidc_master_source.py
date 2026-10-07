"""OIDC master data must not be replaced by local or invented identities."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

import main
from oidc_directory import normalize_directory


def test_directory_user_without_role_has_no_invented_role():
    row = normalize_directory("users", [{"id": "sub-1", "username": "alice"}])[0]
    assert row["role"] == ""
    assert row["roles"] == []
    assert row["job_level"] == ""


def test_login_rejects_oidc_user_without_role():
    with pytest.raises(HTTPException) as error:
        main._map_dashboard_user({"id": "sub-1", "username": "alice"}, "token")
    assert error.value.status_code == 502


def test_login_keeps_department_separate_from_division():
    principal = main._map_dashboard_user({
        "id": "sub-1",
        "username": "TRST-BUDI",
        "role": "user",
        "departments": [{"code": "SAP", "name": "SAP Department"}],
        "divisions": [{"code": "DIV-SAP-ABAP", "name": "ABAP"}],
    }, "token")
    assert principal["department_code"] == "SAP"
    assert principal["department_name"] == "SAP Department"
    assert principal["division_code"] == "DIV-SAP-ABAP"


def test_active_divisions_come_from_oidc():
    divisions = [{"code": "OPS", "name": "Operations"}]
    with patch.object(main, "fetch_directory", new_callable=AsyncMock, return_value=divisions) as fetch:
        result = asyncio.run(main.get_active_divisions_endpoint(user={"dashboard_token": "token"}))
    assert result == divisions
    fetch.assert_awaited_once_with("divisions", "token")


def test_oidc_directory_error_is_not_replaced_with_local_master_data():
    error = HTTPException(status_code=502, detail="Directory OIDC tidak merespons.")
    with patch.object(main, "fetch_directory", new_callable=AsyncMock, side_effect=error):
        with pytest.raises(HTTPException) as caught:
            asyncio.run(main.get_admin_top_users_endpoint(admin={"dashboard_token": "token"}))
    assert caught.value.status_code == 502


def test_mode_user_matrix_uses_oidc_subject_and_roles():
    directory = [{"id": "stable-sub", "username": "renamed-user", "roles": ["analyst"]}]
    with patch.object(main, "fetch_directory", new_callable=AsyncMock, return_value=directory), \
         patch.object(main, "get_user_modes_matrix", return_value={"modes": []}) as matrix:
        result = asyncio.run(main.get_admin_user_modes_matrix_endpoint(
            "renamed-user", admin={"dashboard_token": "token"}
        ))
    assert result == {"modes": []}
    matrix.assert_called_once_with("stable-sub", oidc_roles=["analyst"])
