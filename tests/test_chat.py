"""Alur chat: kuota tamu, riwayat, dan metadata berkas yang tersimpan."""
import json

import pytest

from models import ChatResponse


@pytest.fixture(autouse=True)
def stub_agent(monkeypatch):
    """Ganti agen AI dengan balasan tetap; pengujian ini soal alur, bukan model."""
    import main
    from artifacts import extract_and_build

    async def fake_process(chat_req, role, persona, username="Guest", **kwargs):
        spec = {
            "type": "xlsx",
            "filename": "hasil.xlsx",
            "sheets": [{"name": "S", "columns": ["A"], "rows": [[1]]}],
        }
        reply = "Ini jawabannya.\n```sap-artifact\n" + json.dumps(spec) + "\n```"
        cleaned, built = extract_and_build(reply, owner=username)
        return ChatResponse(reply=cleaned, sources=[], artifacts=built)

    monkeypatch.setattr(main, "process_chat", fake_process)


def test_artifacts_survive_a_reload(client, make_user):
    """Metadata berkas harus ikut tersimpan, bukan hanya dikirim sekali."""
    auth = make_user("art_user")
    res = client.post("/api/chat", json={"message": "buatkan excel"}, headers=auth).json()
    assert res["artifacts"], "respons chat tidak memuat berkas"

    history = client.get(f"/api/sessions/{res['session_id']}/messages", headers=auth).json()
    ai_message = [m for m in history if m["role"] == "ai"][-1]
    stored = json.loads(ai_message["artifacts"])
    assert stored[0]["artifact_id"] == res["artifacts"][0]["artifact_id"]


def test_downloaded_file_is_scoped_to_owner(client, make_user):
    owner = make_user("dl_owner")
    other = make_user("dl_other")
    artifact = client.post("/api/chat", json={"message": "buatkan excel"}, headers=owner).json()["artifacts"][0]

    assert client.get(f"/api/artifacts/{artifact['artifact_id']}", headers=owner).status_code == 200
    assert client.get(f"/api/artifacts/{artifact['artifact_id']}", headers=other).status_code == 404
    assert client.get(f"/api/artifacts/{artifact['artifact_id']}").status_code == 404


def test_message_history_is_paginated(client, make_user, db):
    auth = make_user("page_user")
    session_id = client.post("/api/sessions", json={"title": "Panjang"}, headers=auth).json()["session_id"]
    for i in range(30):
        db.add_chat_message(session_id, "user", f"pesan {i}")

    page = client.get(f"/api/sessions/{session_id}/messages?limit=10", headers=auth).json()
    assert len(page) == 10
    # Halaman terakhir dikembalikan dalam urutan kronologis.
    assert page[-1]["content"] == "pesan 29"

    older = client.get(
        f"/api/sessions/{session_id}/messages?limit=10&before_id={page[0]['id']}", headers=auth
    ).json()
    assert len(older) == 10 and older[-1]["content"] == "pesan 19"


def test_guest_quota_enforced_server_side(client):
    """Penghitung di localStorage dapat direset user kapan saja."""
    from config import settings

    codes = [
        client.post("/api/chat", json={"message": f"halo {i}"}).status_code
        for i in range(settings.guest_daily_limit + 2)
    ]
    assert 429 in codes


# --- Sumber dan ukuran riwayat percakapan ---

def test_client_supplied_history_is_ignored_for_logged_in_users(client, make_user, db, monkeypatch):
    """Riwayat berasal dari database, bukan dari apa yang dikirim browser.

    Sebelumnya klien yang menentukan berapa banyak riwayat ikut dikirim ke
    model, sehingga biaya token dapat dibengkakkan dari sisi browser.
    """
    import main
    from models import ChatResponse

    dilihat = {}

    async def tangkap(chat_req, role, persona, username="Guest", on_progress=None, on_token=None):
        dilihat["history"] = list(chat_req.history)
        return ChatResponse(reply="ok", sources=[], artifacts=[])

    monkeypatch.setattr(main, "process_chat", tangkap)

    auth = make_user("hist_user")
    sesi = client.post("/api/sessions", json={"title": "Uji"}, headers=auth).json()["session_id"]
    db.add_chat_message(sesi, "user", "pesan asli dari database")
    db.add_chat_message(sesi, "ai", "jawaban asli dari database")

    palsu = [{"role": "user", "content": "RIWAYAT PALSU " + "x" * 5000}]
    client.post(
        "/api/chat",
        json={"message": "lanjutkan", "session_id": sesi, "history": palsu},
        headers=auth,
    )

    gabungan = " ".join(m["content"] for m in dilihat["history"])
    assert "RIWAYAT PALSU" not in gabungan
    assert "pesan asli dari database" in gabungan


def test_history_sent_to_model_stays_within_budget(client, make_user, db, monkeypatch):
    import main
    from config import settings
    from conversation import estimate_history_tokens
    from models import ChatResponse

    dilihat = {}

    async def tangkap(chat_req, role, persona, username="Guest", on_progress=None, on_token=None):
        from conversation import trim_history

        dipangkas, _ = trim_history(
            chat_req.history,
            token_budget=settings.history_token_budget,
            verbatim_turns=settings.history_verbatim_turns,
        )
        dilihat["tokens"] = estimate_history_tokens(dipangkas)
        return ChatResponse(reply="ok", sources=[], artifacts=[])

    monkeypatch.setattr(main, "process_chat", tangkap)

    auth = make_user("budget_user")
    sesi = client.post("/api/sessions", json={"title": "Panjang"}, headers=auth).json()["session_id"]
    tabel = "| A | B |\n|---|---|\n" + "\n".join(f"| baris-{i} | {i * 7} |" for i in range(40))
    for i in range(40):
        db.add_chat_message(sesi, "user", f"pertanyaan {i}")
        db.add_chat_message(sesi, "ai", tabel)

    client.post("/api/chat", json={"message": "lanjutkan", "session_id": sesi}, headers=auth)

    assert dilihat["tokens"] <= settings.history_token_budget, dilihat
