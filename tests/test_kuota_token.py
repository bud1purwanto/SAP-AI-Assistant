"""Kuota token, batas per menit, dan hak ubah program per peran."""
import pytest

from models import ChatResponse, UsageStats


@pytest.fixture
def agen_dengan_token(monkeypatch):
    """Agen tiruan yang melaporkan pemakaian token seperti provider sungguhan."""
    import main

    async def fake(chat_req, role, persona, username="Guest", on_progress=None, on_token=None):
        return ChatResponse(
            reply="Jawaban singkat.",
            sources=[],
            artifacts=[],
            usage=UsageStats(prompt_tokens=1000, completion_tokens=200, total_tokens=1200),
        )

    monkeypatch.setattr(main, "process_chat", fake)


@pytest.fixture
def agen_tanpa_token(monkeypatch):
    """Provider yang tidak melaporkan pemakaian sama sekali."""
    import main

    async def fake(chat_req, role, persona, username="Guest", on_progress=None, on_token=None):
        return ChatResponse(reply="Jawaban " * 50, sources=[], artifacts=[], usage=None)

    monkeypatch.setattr(main, "process_chat", fake)


def _atur_batas(client, admin_auth, role, harian, per_menit=0):
    res = client.put("/api/admin/quota/limits", headers=admin_auth, json={
        "role": role, "daily_token_limit": harian, "per_minute_limit": per_menit,
    })
    assert res.status_code == 200, res.text


def _saklar(client, admin_auth, aktif):
    res = client.post("/api/admin/quota/enabled", headers=admin_auth, json={"enabled": aktif})
    assert res.status_code == 200, res.text


# --------------------------------------------------------------------------
# Pencatatan
# --------------------------------------------------------------------------

def test_pemakaian_dicatat_walau_pembatasan_dimatikan(client, admin_auth, make_user, agen_dengan_token):
    """Admin butuh angka sebelum dapat menentukan batas yang wajar."""
    _saklar(client, admin_auth, False)
    auth = make_user("kuota1")

    client.post("/api/chat", json={"message": "halo"}, headers=auth)
    kuota = client.get("/api/quota", headers=auth).json()

    assert kuota["enforced"] is False
    assert kuota["used_tokens"] == 1200
    assert kuota["requests_today"] == 1


def test_pemakaian_bertambah_pada_permintaan_berikutnya(client, admin_auth, make_user, agen_dengan_token):
    _saklar(client, admin_auth, False)
    auth = make_user("kuota2")

    for _ in range(3):
        client.post("/api/chat", json={"message": "halo"}, headers=auth)

    assert client.get("/api/quota", headers=auth).json()["used_tokens"] == 3600


def test_token_diperkirakan_bila_provider_diam(client, admin_auth, make_user, agen_tanpa_token):
    """Tanpa perkiraan, batas apa pun tak akan pernah tercapai pada provider
    yang tidak melaporkan pemakaian."""
    _saklar(client, admin_auth, False)
    auth = make_user("kuota3")

    res = client.post("/api/chat", json={"message": "halo"}, headers=auth)
    assert res.json()["usage"]["estimated"] is True

    kuota = client.get("/api/quota", headers=auth).json()
    assert kuota["used_tokens"] > 0
    assert kuota["estimated"] is True, "angka perkiraan harus ditandai, bukan disajikan sebagai hasil ukur"


# --------------------------------------------------------------------------
# Penegakan
# --------------------------------------------------------------------------

def test_pembatasan_mati_berarti_bebas_prompt(client, admin_auth, make_user, agen_dengan_token):
    _saklar(client, admin_auth, False)
    _atur_batas(client, admin_auth, "abaper", 100)   # jauh di bawah pemakaian
    auth = make_user("kuota4", role="abaper")

    for _ in range(3):
        assert client.post("/api/chat", json={"message": "halo"}, headers=auth).status_code == 200


def test_pembatasan_nyala_menolak_setelah_kuota_habis(client, admin_auth, make_user, agen_dengan_token):
    _saklar(client, admin_auth, True)
    _atur_batas(client, admin_auth, "abaper", 1500)
    auth = make_user("kuota5", role="abaper")

    # Permintaan pertama lolos: pemakaian yang tercatat masih nol.
    assert client.post("/api/chat", json={"message": "halo"}, headers=auth).status_code == 200
    # Sesudahnya 1200 dari 1500 sudah terpakai — masih di bawah batas.
    assert client.post("/api/chat", json={"message": "halo"}, headers=auth).status_code == 200
    # Kini 2400 > 1500, permintaan berikutnya ditolak.
    res = client.post("/api/chat", json={"message": "halo"}, headers=auth)
    assert res.status_code == 429
    assert "kuota" in res.json()["detail"].lower()

    _saklar(client, admin_auth, False)


def test_batas_nol_berarti_tanpa_batas(client, admin_auth, make_user, agen_dengan_token):
    _saklar(client, admin_auth, True)
    _atur_batas(client, admin_auth, "abaper", 0)
    auth = make_user("kuota6", role="abaper")

    for _ in range(4):
        assert client.post("/api/chat", json={"message": "halo"}, headers=auth).status_code == 200
    assert client.get("/api/quota", headers=auth).json()["unlimited"] is True

    _saklar(client, admin_auth, False)


def test_batas_per_menit_menahan_permintaan_beruntun(client, admin_auth, make_user, agen_dengan_token):
    _saklar(client, admin_auth, True)
    _atur_batas(client, admin_auth, "functional", 0, per_menit=2)
    auth = make_user("kuota7", role="functional")

    assert client.post("/api/chat", json={"message": "a"}, headers=auth).status_code == 200
    assert client.post("/api/chat", json={"message": "b"}, headers=auth).status_code == 200
    res = client.post("/api/chat", json={"message": "c"}, headers=auth)
    assert res.status_code == 429
    assert "per menit" in res.json()["detail"].lower()

    _saklar(client, admin_auth, False)


# --------------------------------------------------------------------------
# Pengaturan admin
# --------------------------------------------------------------------------

def test_admin_dapat_mereset_kuota_satu_pengguna(client, admin_auth, make_user, agen_dengan_token):
    _saklar(client, admin_auth, False)
    auth = make_user("kuota8")
    client.post("/api/chat", json={"message": "halo"}, headers=auth)
    assert client.get("/api/quota", headers=auth).json()["used_tokens"] > 0

    res = client.post("/api/admin/quota/reset", params={"username": "kuota8"}, headers=admin_auth)
    assert res.status_code == 200
    assert client.get("/api/quota", headers=auth).json()["used_tokens"] == 0


def test_admin_dapat_mereset_seluruh_pengguna(client, admin_auth, make_user, agen_dengan_token):
    _saklar(client, admin_auth, False)
    a = make_user("kuota9")
    b = make_user("kuota10")
    client.post("/api/chat", json={"message": "halo"}, headers=a)
    client.post("/api/chat", json={"message": "halo"}, headers=b)

    client.post("/api/admin/quota/reset", headers=admin_auth)

    assert client.get("/api/quota", headers=a).json()["used_tokens"] == 0
    assert client.get("/api/quota", headers=b).json()["used_tokens"] == 0


def test_admin_dapat_mengubah_batas_per_peran(client, admin_auth):
    _atur_batas(client, admin_auth, "abaper", 2_000_000, per_menit=12)
    data = client.get("/api/admin/quota", headers=admin_auth).json()
    assert data["role_limits"]["abaper"]["daily_token_limit"] == 2_000_000
    assert data["role_limits"]["abaper"]["per_minute_limit"] == 12


def test_batas_negatif_ditolak(client, admin_auth):
    res = client.put("/api/admin/quota/limits", headers=admin_auth, json={
        "role": "abaper", "daily_token_limit": -5, "per_minute_limit": 0,
    })
    assert res.status_code == 400


def test_peran_tak_dikenal_ditolak(client, admin_auth):
    res = client.put("/api/admin/quota/limits", headers=admin_auth, json={
        "role": "raja", "daily_token_limit": 100, "per_minute_limit": 0,
    })
    assert res.status_code == 400


def test_pengaturan_kuota_hanya_untuk_admin(client, make_user):
    auth = make_user("kuota11")
    assert client.get("/api/admin/quota", headers=auth).status_code == 403
    assert client.post("/api/admin/quota/reset", headers=auth).status_code == 403
    assert client.put("/api/admin/quota/limits", headers=auth, json={
        "role": "abaper", "daily_token_limit": 1, "per_minute_limit": 1,
    }).status_code == 403


def test_pengguna_hanya_melihat_kuotanya_sendiri(client, make_user, agen_dengan_token):
    auth = make_user("kuota12")
    kuota = client.get("/api/quota", headers=auth).json()
    assert kuota["role"] == "user"
    assert "username" not in kuota
