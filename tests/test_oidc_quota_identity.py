"""Regresi: kuota mengikuti sub OIDC, bukan username yang dapat berubah."""

import pytest

from models import ChatResponse, UsageStats


@pytest.fixture
def agen_dengan_token(monkeypatch):
    import main

    async def fake(chat_req, role, persona, username="Guest", on_progress=None, on_token=None):
        return ChatResponse(
            reply="Jawaban singkat.",
            sources=[],
            artifacts=[],
            usage=UsageStats(prompt_tokens=1000, completion_tokens=200, total_tokens=1200),
        )

    monkeypatch.setattr(main, "process_chat", fake)


def test_batas_kuota_disimpan_dengan_sub_oidc(client, admin_auth):
    response = client.put(
        "/api/admin/quota/limits",
        headers=admin_auth,
        json={
            "oidc_sub": "oidc-user-123",
            "daily_token_limit": 1500,
            "per_minute_limit": 3,
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["user_limits"]["oidc-user-123"] == {
        "daily_token_limit": 1500,
        "per_minute_limit": 3,
    }


def test_kuota_tetap_terpakai_setelah_username_oidc_berubah(
    client, admin_auth, make_user, agen_dengan_token
):
    sub = "oidc-user-renamed-123"
    set_limit = client.put(
        "/api/admin/quota/limits",
        headers=admin_auth,
        json={
            "oidc_sub": sub,
            "daily_token_limit": 1500,
            "per_minute_limit": 0,
        },
    )
    assert set_limit.status_code == 200, set_limit.text

    username_lama = make_user("trst-budi", sub=sub, access_token=None)
    assert client.post("/api/chat", json={"message": "halo"}, headers=username_lama).status_code == 200

    username_baru = make_user("budi-baru", sub=sub, access_token=None)
    quota = client.get("/api/quota", headers=username_baru)
    assert quota.status_code == 200
    assert quota.json()["used_tokens"] == 1200
    assert quota.json()["daily_token_limit"] == 1500


def test_sub_oidc_belum_diatur_mendapat_default_sejuta_saat_penegakan_aktif(monkeypatch):
    import main

    monkeypatch.setattr(main, "get_system_config", lambda: {"token_limit_enabled": True})
    monkeypatch.setattr(main, "get_user_token_limit", lambda _sub: None)
    monkeypatch.setattr(main, "get_token_usage", lambda _sub: {
        "total_tokens": 0,
        "requests": 0,
        "estimated": False,
        "usage_date": "2026-09-29",
    })

    quota = main.status_kuota("oidc-pending-123", ["user"])

    assert quota["daily_token_limit"] == 1_000_000
    assert quota["limit_configured"] is False
    assert quota["limit_status"] == "pending"


def test_sub_oidc_belum_diatur_tetap_tanpa_batas_saat_penegakan_mati(monkeypatch):
    import main

    monkeypatch.setattr(main, "get_system_config", lambda: {"token_limit_enabled": False})
    monkeypatch.setattr(main, "get_user_token_limit", lambda _sub: None)
    monkeypatch.setattr(main, "get_token_usage", lambda _sub: {
        "total_tokens": 0,
        "requests": 0,
        "estimated": False,
        "usage_date": "2026-09-29",
    })

    quota = main.status_kuota("oidc-pending-123", ["user"])

    assert quota["daily_token_limit"] == 0
    assert quota["limit_configured"] is False
    assert quota["limit_status"] == "pending"


def test_directory_oidc_mempertahankan_id_sebagai_sub_stabil():
    from oidc_directory import normalize_directory

    users = normalize_directory("users", [{
        "id": "oidc-user-123",
        "username": "TRST-Budi",
        "displayName": "Budi Purwanto",
        "roles": [{"code": "user"}],
    }])

    assert users == [{
        "id": "oidc-user-123",
        "username": "TRST-Budi",
        "full_name": "Budi Purwanto",
        "role": "user",
        "roles": ["user"],
        "division_code": "",
        "division_name": "",
        "department_code": "",
        "position_code": "",
        "position_name": "",
        "job_level": "staff",
        "enabled": True,
    }]
