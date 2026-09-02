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
    assert any("ABAP" in t or "ST22" in t or "Query" in t for t in titles)


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

    async def fake_generate(role="guest", persona="", recent_queries=None, lang="id"):
        return mock_llm_suggestions

    monkeypatch.setattr(agent, "generate_chat_suggestions", fake_generate)

    auth = make_user("test_llm_user", role="abaper")
    res = client.get("/api/chat/suggestions?lang=id", headers=auth)
    assert res.status_code == 200
    data = res.json()
    assert data["suggestions"] == mock_llm_suggestions

