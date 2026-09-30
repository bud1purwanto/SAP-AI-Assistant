"""Regresi pemetaan status wajib mengganti password dari OIDC."""

from datetime import datetime, timezone

from auth import create_session_cookie, decode_session_cookie
from main import _map_dashboard_user


def test_cookie_bff_tidak_melebihi_masa_token_oidc():
    before = datetime.now(timezone.utc).timestamp()
    cookie = create_session_cookie(
        {"sub": "u-1", "username": "user", "session_expire_seconds": 900}
    )
    payload = decode_session_cookie(cookie)

    assert payload is not None
    assert before + 890 <= payload["exp"] <= before + 910




def test_pemetaan_oidc_meneruskan_status_wajib_ganti_password():
    principal = _map_dashboard_user(
        {
            "id": "oidc-user-reset-123",
            "username": "user-reset",
            "role": "viewer",
            "mustChangePassword": True,
        },
        "token-oidc-sementara",
    )

    assert principal["sub"] == "oidc-user-reset-123"
    assert principal["force_change_password"] is True


def test_pemetaan_oidc_normal_tidak_memaksa_ganti_password():
    principal = _map_dashboard_user(
        {"id": "oidc-user-normal-456", "username": "user-normal", "role": "viewer"},
        "token-oidc-normal",
    )

    assert principal["force_change_password"] is False
