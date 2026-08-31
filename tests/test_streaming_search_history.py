"""Streaming jawaban, pemotongan riwayat, dan pencarian percakapan."""
import json

import pytest

from models import ChatResponse


def _parse_events(raw: str):
    return [json.loads(line[6:]) for line in raw.splitlines() if line.startswith("data: ")]


# --------------------------------------------------------------------------
# Streaming token
# --------------------------------------------------------------------------

@pytest.fixture
def streaming_agent(monkeypatch):
    """Agen tiruan yang mengalirkan teks, membatalkannya, lalu menulis ulang."""
    import main

    async def fake_process(chat_req, role, persona, username="Guest", on_progress=None, on_token=None):
        if on_token:
            # Potongan pertama ternyata bukan jawaban akhir.
            await on_token(text="Sebentar")
            await on_token(reset=True)
            await on_token(text="Stok ")
            await on_token(text="250 PC.")
        return ChatResponse(reply="Stok 250 PC.", sources=[], artifacts=[])

    monkeypatch.setattr(main, "process_chat", fake_process)


def test_stream_mengirim_token_dan_pembatalan(client, make_user, streaming_agent):
    auth = make_user("streamer1")
    with client.stream("POST", "/api/chat/stream", json={"message": "stok?"}, headers=auth) as res:
        assert res.status_code == 200
        events = _parse_events("".join(res.iter_text()))

    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert tokens == ["Sebentar", "Stok ", "250 PC."]

    kinds = [e["type"] for e in events]
    # Pembatalan harus tiba sesudah token pertama dan sebelum token berikutnya,
    # supaya klien tahu persis teks mana yang dibuang.
    assert kinds.index("token_reset") == 1
    assert kinds[-1] == "result"

    result = next(e for e in events if e["type"] == "result")
    assert result["data"]["reply"] == "Stok 250 PC."


def test_chat_biasa_tetap_jalan_tanpa_streaming(client, make_user, streaming_agent):
    """Endpoint non-streaming tidak menyediakan on_token; jawabannya tetap utuh."""
    auth = make_user("streamer2")
    res = client.post("/api/chat", json={"message": "stok?"}, headers=auth)
    assert res.status_code == 200
    assert res.json()["reply"] == "Stok 250 PC."


# --------------------------------------------------------------------------
# Pemotongan riwayat (dasar dari "buat ulang" & "edit pertanyaan")
# --------------------------------------------------------------------------

@pytest.fixture
def simple_agent(monkeypatch):
    import main

    async def fake_process(chat_req, role, persona, username="Guest", on_progress=None, on_token=None):
        return ChatResponse(reply=f"Jawaban untuk: {chat_req.message}", sources=[], artifacts=[])

    monkeypatch.setattr(main, "process_chat", fake_process)


def _kirim(client, auth, pesan, session_id=None):
    res = client.post("/api/chat", json={"message": pesan, "session_id": session_id}, headers=auth)
    assert res.status_code == 200, res.text
    return res.json()


def test_hapus_pesan_ikut_menghapus_pesan_sesudahnya(client, make_user, simple_agent):
    auth = make_user("pemotong1")
    first = _kirim(client, auth, "pertanyaan satu")
    sid = first["session_id"]
    _kirim(client, auth, "pertanyaan dua", sid)

    msgs = client.get(f"/api/sessions/{sid}/messages", headers=auth).json()
    assert len(msgs) == 4
    # Potong mulai dari pertanyaan kedua: dua pesan terakhir harus hilang.
    target = msgs[2]["id"]

    res = client.delete(f"/api/messages/{target}", headers=auth)
    assert res.status_code == 200
    assert res.json()["session_id"] == sid

    sisa = client.get(f"/api/sessions/{sid}/messages", headers=auth).json()
    assert [m["content"] for m in sisa] == ["pertanyaan satu", "Jawaban untuk: pertanyaan satu"]


def test_hanya_bisa_memotong_riwayat_sendiri(client, make_user, simple_agent):
    auth_a = make_user("pemotong2")
    auth_b = make_user("pemotong3")
    sid = _kirim(client, auth_a, "rahasia milik A")["session_id"]
    msgs = client.get(f"/api/sessions/{sid}/messages", headers=auth_a).json()

    res = client.delete(f"/api/messages/{msgs[0]['id']}", headers=auth_b)
    assert res.status_code == 404

    # Riwayat A tetap utuh.
    assert len(client.get(f"/api/sessions/{sid}/messages", headers=auth_a).json()) == 2


def test_memotong_pesan_yang_tidak_ada(client, make_user):
    auth = make_user("pemotong4")
    assert client.delete("/api/messages/99999999", headers=auth).status_code == 404


# --------------------------------------------------------------------------
# Pencarian riwayat
# --------------------------------------------------------------------------

def test_pencarian_menemukan_isi_pesan_beserta_cuplikan(client, make_user, simple_agent):
    auth = make_user("pencari1")
    _kirim(client, auth, "cek stok material SRRPAI di plant 1000")
    _kirim(client, auth, "buatkan ringkasan cuti tahunan")

    hasil = client.get("/api/sessions/search", params={"q": "SRRPAI"}, headers=auth)
    assert hasil.status_code == 200
    data = hasil.json()
    assert len(data) == 1
    assert "SRRPAI" in data[0]["snippet"]
    assert data[0]["hits"] >= 1


def test_pencarian_tidak_peka_huruf_besar_kecil(client, make_user, simple_agent):
    auth = make_user("pencari2")
    _kirim(client, auth, "Laporan Purchase Order bulan ini")
    data = client.get("/api/sessions/search", params={"q": "purchase order"}, headers=auth).json()
    assert len(data) == 1


def test_pencarian_tidak_membocorkan_percakapan_user_lain(client, make_user, simple_agent):
    auth_a = make_user("pencari3")
    auth_b = make_user("pencari4")
    _kirim(client, auth_a, "kontrak vendor ACME rahasia")

    assert client.get("/api/sessions/search", params={"q": "ACME"}, headers=auth_b).json() == []
    assert len(client.get("/api/sessions/search", params={"q": "ACME"}, headers=auth_a).json()) == 1


def test_pencarian_terlalu_pendek_dikembalikan_kosong(client, make_user, simple_agent):
    auth = make_user("pencari5")
    _kirim(client, auth, "material master")
    assert client.get("/api/sessions/search", params={"q": "m"}, headers=auth).json() == []
    assert client.get("/api/sessions/search", params={"q": ""}, headers=auth).json() == []


def test_pencarian_butuh_login(client):
    assert client.get("/api/sessions/search", params={"q": "apa saja"}).status_code == 401


# --------------------------------------------------------------------------
# Urutan riwayat: percakapan lama yang dipakai lagi harus naik ke atas
# --------------------------------------------------------------------------

def test_sesi_lama_naik_ke_atas_setelah_dipakai_lagi(client, make_user, simple_agent):
    auth = make_user("pengurut1")
    lama = _kirim(client, auth, "percakapan lama")["session_id"]
    baru = _kirim(client, auth, "percakapan baru")["session_id"]

    urutan = [s["session_id"] for s in client.get("/api/sessions", headers=auth).json()]
    assert urutan[0] == baru

    _kirim(client, auth, "lanjutan di percakapan lama", lama)

    urutan = [s["session_id"] for s in client.get("/api/sessions", headers=auth).json()]
    assert urutan[0] == lama, "sesi yang baru saja dipakai harus berada di paling atas"


def test_waktu_sesi_membawa_zona_waktu(client, make_user, simple_agent):
    """Tanpa offset, browser membacanya sebagai waktu lokal dan salah kelompok."""
    auth = make_user("pengurut2")
    _kirim(client, auth, "halo")
    sesi = client.get("/api/sessions", headers=auth).json()[0]
    for field in ("created_at", "updated_at"):
        nilai = sesi[field]
        assert nilai.endswith("Z") or "+" in nilai[10:] or "-" in nilai[10:], (
            f"{field} tidak membawa zona waktu: {nilai}"
        )


def test_migrasi_zona_waktu_tidak_menggeser_nilai_saat_diulang(client, make_user, simple_agent):
    """init_db dijalankan setiap kali aplikasi hidup.

    Konversi TIMESTAMP -> TIMESTAMPTZ hanya benar sekali; bila dijalankan lagi
    pada kolom yang sudah bertipe TIMESTAMPTZ, seluruh nilainya akan bergeser
    sebesar offset zona waktu di tiap restart.
    """
    from database import init_db

    auth = make_user("pengurut3")
    _kirim(client, auth, "halo")
    sebelum = client.get("/api/sessions", headers=auth).json()[0]["updated_at"]

    init_db()
    init_db()

    sesudah = client.get("/api/sessions", headers=auth).json()[0]["updated_at"]
    assert sesudah == sebelum


# --------------------------------------------------------------------------
# Penilaian jawaban (layar admin)
# --------------------------------------------------------------------------

def test_admin_melihat_jawaban_yang_dinilai_beserta_pertanyaannya(
    client, admin_auth, make_user, simple_agent
):
    auth = make_user("penilai1")
    hasil = _kirim(client, auth, "kenapa stok tidak cocok")
    client.post(f"/api/messages/{hasil['message_id']}/feedback",
                json={"feedback": "dislike"}, headers=auth)

    data = client.get("/api/admin/feedback", params={"kind": "dislike"}, headers=admin_auth)
    assert data.status_code == 200
    body = data.json()
    assert body["total"] >= 1

    item = next(i for i in body["items"] if i["message_id"] == hasil["message_id"])
    # Angka kepuasan saja tidak cukup: admin perlu tahu jawaban apa atas pertanyaan apa.
    assert item["question"] == "kenapa stok tidak cocok"
    assert item["answer"] == hasil["reply"]
    assert item["username"].lower() == "penilai1"


def test_daftar_penilaian_hanya_untuk_admin(client, make_user):
    auth = make_user("penilai2")
    assert client.get("/api/admin/feedback", headers=auth).status_code == 403
    assert client.get("/api/admin/feedback").status_code == 401


def test_penilaian_like_dan_dislike_terpisah(client, admin_auth, make_user, simple_agent):
    auth = make_user("penilai3")
    suka = _kirim(client, auth, "pertanyaan yang dijawab baik")
    client.post(f"/api/messages/{suka['message_id']}/feedback",
                json={"feedback": "like"}, headers=auth)

    likes = client.get("/api/admin/feedback", params={"kind": "like"}, headers=admin_auth).json()
    dislikes = client.get("/api/admin/feedback", params={"kind": "dislike"}, headers=admin_auth).json()

    assert suka["message_id"] in [i["message_id"] for i in likes["items"]]
    assert suka["message_id"] not in [i["message_id"] for i in dislikes["items"]]
