# Pengujian Backend

Pengujian berjalan di atas **PostgreSQL sungguhan**, sama seperti produksi.
Schema `ai_assistant` dibuat ulang untuk setiap modul uji, sehingga hasilnya
tidak bergantung pada urutan menjalankan tes.

## Menjalankan

```bash
pip install -r backend/requirements.txt
# Database uji (JANGAN arahkan ke database produksi — schema akan di-DROP)
export TEST_DATABASE_URL="postgresql+psycopg://postgres:postgres@127.0.0.1:5432/ABAP_DB"
pytest
```

Menjalankan satu berkas atau satu tes:

```bash
pytest tests/test_isolation.py
pytest -k "artifact and owner"
```

## Cakupan

| Berkas | Yang dijaga |
| :--- | :--- |
| `test_auth.py` | Hashing bcrypt, penolakan token palsu, header `X-User-Name` tidak lagi mengautentikasi, kredensial bawaan lama sudah mati, pembatasan percobaan login |
| `test_isolation.py` | Sesi dan pesan tidak bocor antar user; API key tidak dikirim ke user biasa |
| `test_artifacts.py` | Excel/CSV/Word terbentuk benar, angka tetap numerik, berkas hanya bisa diunduh pemiliknya, kuota per user |
| `test_chat.py` | Metadata berkas bertahan setelah reload, paginasi riwayat, kuota tamu ditegakkan server |
| `test_persona_and_prompt.py` | Persona organisasi sebagai lapisan dasar, preferensi pribadi di atasnya, prompt mengizinkan jawaban non-SAP |
| `test_agent_internals.py` | Pembersihan keluaran tidak merusak isi, pasangan set-target/panggil-tool tetap atomik |
| `test_database.py` | `init_db` idempoten, migrasi password plaintext lama, penghapusan melaporkan hasil sebenarnya |

Sebagian besar tes ini ditulis setelah menemukan bug nyata; komentar di dalam
berkas menjelaskan bug apa yang dijaga agar tidak terulang.

## Catatan

Pengujian tidak memanggil model AI maupun server MCP. Agen diganti dengan
tiruan (`monkeypatch`) supaya hasilnya deterministik dan tidak memakai kuota.
