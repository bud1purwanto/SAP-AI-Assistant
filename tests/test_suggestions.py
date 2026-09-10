"""Pengujian endpoint saran pertanyaan dinamis (/api/chat/suggestions)."""
import pytest


def test_suggestions_guest_id(client):
    """Guest tanpa login harus mendapatkan saran default bahasa Indonesia."""
    res = client.get("/api/chat/suggestions?lang=id")
    assert res.status_code == 200
    data = res.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) >= 3
    for s in data["suggestions"]:
        assert "title" in s
        assert "subtitle" in s
        assert "query" in s
        assert "icon" in s


def test_suggestions_guest_en(client):
    """Guest dengan parameter lang=en harus mendapatkan saran dalam bahasa Inggris."""
    res = client.get("/api/chat/suggestions?lang=en")
    assert res.status_code == 200
    data = res.json()
    assert len(data["suggestions"]) >= 3
    titles = [s["title"] for s in data["suggestions"]]
    assert any("Stock" in t for t in titles)


def test_suggestions_abaper_role(client, make_user):
    """User dengan role abaper mendapatkan saran spesifik ABAP jika LLM fallback."""
    auth = make_user("abap_dev", role="abaper")
    res = client.get("/api/chat/suggestions?lang=id", headers=auth)
    assert res.status_code == 200
    data = res.json()
    assert len(data["suggestions"]) >= 3
    titles = [s["title"] for s in data["suggestions"]]
    assert any(any(k in t for k in ["ABAP", "ST22", "Query", "IDoc", "CDS", "SM12", "BAPI"]) for t in titles)


def test_suggestions_with_mocked_llm(client, make_user, monkeypatch):
    """Saat LLM merespons JSON, endpoint mengembalikan saran dinamis tersebut."""
    import agent

    mock_llm_suggestions = [
        {
            "title": "Cek IDoc Gagal",
            "subtitle": "Investigasi status IDoc EDIDC/EDIDS",
            "query": "Tampilkan daftar IDoc yang error status 51 hari ini.",
            "icon": "Shield"
        },
        {
            "title": "BAPI PO Change",
            "subtitle": "Template pemanggilan BAPI_PO_CHANGE",
            "query": "Berikan contoh source code memanggil BAPI_PO_CHANGE untuk update delivery date.",
            "icon": "Code"
        },
        {
            "title": "Analisis Lock SM12",
            "subtitle": "Panduan cek enqueue lock table",
            "query": "Bagaimana cara menangani lock object yang menggantung di SM12?",
            "icon": "Zap"
        }
    ]

    async def fake_generate(role="guest", persona="", recent_queries=None, lang="id", **kwargs):
        return mock_llm_suggestions

    monkeypatch.setattr(agent, "generate_chat_suggestions", fake_generate)

    auth = make_user("test_llm_user", role="abaper")
    res = client.get("/api/chat/suggestions?lang=id", headers=auth)
    assert res.status_code == 200
    data = res.json()
    assert data["suggestions"] == mock_llm_suggestions


def test_suggestions_disabled_toggle(client, admin_auth):
    """Admin dapat menonaktifkan ai_suggestions_enabled sehingga sistem langsung memakai fallback tanpa LLM."""
    res_off = client.post("/api/config", json={"ai_suggestions_enabled": False}, headers=admin_auth)
    assert res_off.status_code == 200

    res_sug = client.get("/api/chat/suggestions?lang=id")
    assert res_sug.status_code == 200
    data = res_sug.json()
    assert data.get("dynamic") is False
    assert len(data["suggestions"]) >= 3

    res_on = client.post("/api/config", json={"ai_suggestions_enabled": True}, headers=admin_auth)
    assert res_on.status_code == 200


def test_suggestions_by_division_pp_static(client, make_user, admin_auth):
    """User divisi PP mendapatkan kartu saran seputar produksi saat mode statis aktif."""
    from database import create_division, get_division
    if not get_division("PP"):
        create_division(code="PP", name="Production Planning", persona="Fokus alur produksi dan konversi")

    client.post("/api/config", json={"ai_suggestions_enabled": False}, headers=admin_auth)
    try:
        auth = make_user("user_pp", division_code="PP")
        res = client.get("/api/chat/suggestions?lang=id", headers=auth)
        assert res.status_code == 200
        data = res.json()
        assert data.get("dynamic") is False
        assert len(data["suggestions"]) >= 3
        titles = [s["title"] for s in data["suggestions"]]
        assert any(any(k in t for k in ["Stok", "Produksi", "Slitting", "RESB", "Scrap", "Work Center", "MRP"]) for t in titles)
    finally:
        client.post("/api/config", json={"ai_suggestions_enabled": True}, headers=admin_auth)


def test_suggestions_by_division_fin_static(client, make_user, admin_auth):
    """User divisi FIN mendapatkan kartu saran seputar keuangan dan rekonsiliasi saat mode statis aktif."""
    from database import create_division, get_division
    if not get_division("FIN"):
        create_division(code="FIN", name="Finance & Accounting", persona="Fokus jurnal dan rekonsiliasi")

    client.post("/api/config", json={"ai_suggestions_enabled": False}, headers=admin_auth)
    try:
        auth = make_user("user_fin", division_code="FIN")
        res = client.get("/api/chat/suggestions?lang=id", headers=auth)
        assert res.status_code == 200
        data = res.json()
        assert data.get("dynamic") is False
        assert len(data["suggestions"]) >= 3
        titles = [s["title"] for s in data["suggestions"]]
        assert any(any(k in t for k in ["GR/IR", "Hutang", "Anggaran", "Jurnal", "Piutang", "FI/CO", "Closing"]) for t in titles)
    finally:
        client.post("/api/config", json={"ai_suggestions_enabled": True}, headers=admin_auth)


def test_suggestions_context_passed_to_llm(client, make_user, monkeypatch):
    """Memastikan profil lengkap (divisi, persona divisi, job level, nama) diteruskan ke generate_chat_suggestions."""
    import agent
    from database import create_division, get_division

    if not get_division("PP"):
        create_division(code="PP", name="Production Planning", persona="Fokus alur produksi dan konversi")

    captured = {}

    async def fake_generate(**kwargs):
        captured.update(kwargs)
        from agent import SuggestionList
        return SuggestionList([
            {"title": "Card 1", "subtitle": "Sub 1", "query": "Q1", "icon": "Layers"},
            {"title": "Card 2", "subtitle": "Sub 2", "query": "Q2", "icon": "Search"},
            {"title": "Card 3", "subtitle": "Sub 3", "query": "Q3", "icon": "Package"},
        ], is_dynamic=True)

    monkeypatch.setattr(agent, "generate_chat_suggestions", fake_generate)

    auth = make_user("user_ctx_test", division_code="PP", job_level="leader", full_name="Budi Santoso")
    res = client.get("/api/chat/suggestions?lang=id", headers=auth)
    assert res.status_code == 200
    data = res.json()
    assert data.get("dynamic") is True
    assert captured.get("division_code") == "PP"
    assert captured.get("job_level") == "leader"
    assert captured.get("full_name") == "Budi Santoso"
    assert "produksi" in (captured.get("division_persona") or "").lower()


def test_servers_command_role_access(client, make_user, admin_auth):
    """Perintah /servers dibatasi hanya untuk admin/IT, user biasa mendapat pesan Akses Terbatas."""
    user_auth = make_user("user_regular", role="user")
    res_user = client.post("/api/chat", json={"message": "/servers"}, headers=user_auth)
    assert res_user.status_code == 200
    reply_user = res_user.json().get("reply", "")
    assert "Akses Terbatas" in reply_user or "Access Restricted" in reply_user

    res_admin = client.post("/api/chat", json={"message": "/servers"}, headers=admin_auth)
    assert res_admin.status_code == 200
    reply_admin = res_admin.json().get("reply", "")
    assert "Gateway Server" in reply_admin


