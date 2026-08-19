"""Alur chat: kuota tamu, riwayat, dan metadata berkas yang tersimpan."""
import json

import pytest

from models import ChatResponse


@pytest.fixture(autouse=True)
def stub_agent(monkeypatch):
    """Ganti agen AI dengan balasan tetap; pengujian ini soal alur, bukan model."""
    import main
    from artifacts import extract_and_build

    async def fake_process(chat_req, role, persona, username="Guest"):
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
