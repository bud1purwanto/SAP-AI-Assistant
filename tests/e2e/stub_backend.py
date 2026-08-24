"""Backend sungguhan dengan model AI diganti agen tiruan.

Tes end-to-end memeriksa alur antarmuka — streaming, edit pertanyaan, buat ulang
jawaban — bukan mutu jawaban model. Memanggil model sungguhan membuat tes lambat,
berbiaya, dan hasilnya berubah-ubah, sehingga hanya `process_chat` yang diganti.
Selebihnya (auth, database, SSE, penyimpanan riwayat) adalah kode produksi.

Dijalankan dengan:
    uvicorn tests.e2e.stub_backend:app
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

import main  # noqa: E402
from models import ChatResponse  # noqa: E402


async def fake_process(chat_req, role, persona, username="Guest",
                       on_progress=None, on_token=None):
    if on_progress:
        await on_progress(stage="thinking", label="Menganalisis pertanyaan…", step=1, max_steps=6)

    kalimat = (
        f"Jawaban untuk {chat_req.message}. "
        "Berikut rinciannya dalam beberapa kalimat agar terlihat mengalir."
    )
    terkirim = ""
    for kata in kalimat.split(" "):
        potongan = kata + " "
        terkirim += potongan
        if on_token:
            await on_token(text=potongan)
        # Jeda kecil supaya tes dapat mengamati teks bertambah bertahap.
        await asyncio.sleep(0.05)

    return ChatResponse(reply=terkirim.strip(), sources=[], artifacts=[])


main.process_chat = fake_process
app = main.app
