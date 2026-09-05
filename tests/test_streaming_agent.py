"""Aliran token dari model sungguhan lewat process_chat.

Tes end-to-end memakai agen tiruan yang MENGGANTI process_chat, sehingga jalur
`call_model` — tempat potongan dari model diubah menjadi event token — tidak
pernah diuji. Bug pertama di jalur itu lolos karena celah tersebut: setiap
potongan dibersihkan satu per satu dengan fungsi yang diakhiri `.strip()`,
sehingga spasi di tepi potongan hilang dan kata-kata menyatu.

Di sini yang ditiru hanya MODELNYA, bukan agennya.
"""
import asyncio

from langchain_core.messages import AIMessageChunk

import agent as agent_module
from models import ChatRequest


class FakeStreamingModel:
    """Model yang mengalirkan potongan teks yang sudah ditentukan."""

    def __init__(self, potongan, tool_calls=None):
        self.potongan = potongan
        self.tool_calls = tool_calls or []
        self.astream_dipanggil = 0
        self.ainvoke_dipanggil = 0

    async def astream(self, msgs):
        self.astream_dipanggil += 1
        for i, teks in enumerate(self.potongan):
            terakhir = i == len(self.potongan) - 1
            yield AIMessageChunk(
                content=teks,
                tool_calls=self.tool_calls if terakhir else [],
            )

    async def ainvoke(self, msgs):
        self.ainvoke_dipanggil += 1
        return AIMessageChunk(content="".join(self.potongan), tool_calls=self.tool_calls)

    def bind_tools(self, tools, **kwargs):
        """Agen mengikat tool ke model; hasil ikatannya tetap model yang sama."""
        return self


async def _jalankan(monkeypatch, model, kumpulkan_token=True):
    """Jalankan process_chat dengan MCP dan LLM dipalsukan."""
    async def fake_tools(server_filter=None):
        return [{"server": "sap", "tool": type("T", (), {"name": "read_table", "description": "baca", "inputSchema": {}})()}]

    monkeypatch.setattr(agent_module.mcp_manager, "get_all_tools", fake_tools)
    monkeypatch.setattr(agent_module, "ChatOpenAI", lambda **kw: model)
    import database
    monkeypatch.setattr(database, "get_system_config", lambda: {
        "nine_router_enabled": True,
        "nine_router_api_key": "kunci-uji",
        "nine_router_base_url": "http://contoh.invalid/v1",
        "nine_router_model": "model-uji",
        "openrouter_enabled": False,
    })

    token = []

    async def on_token(text="", reset=False):
        token.append(None if reset else text)

    hasil = await agent_module.process_chat(
        ChatRequest(message="stok material SRRPAI"),
        "user",
        "",
        username="penguji",
        on_token=on_token if kumpulkan_token else None,
    )
    return hasil, token


def test_spasi_antar_kata_tidak_hilang_saat_mengalir(monkeypatch):
    """Bug yang pernah terjadi: 'Stok material SRRPAI' -> 'StokmaterialSRRPAI'."""
    potongan = ["Stok ", "material ", "SRRPAI ", "adalah ", "250 ", "PC."]
    model = FakeStreamingModel(potongan)

    hasil, token = asyncio.run(_jalankan(monkeypatch, model))

    mengalir = "".join(t for t in token if t)
    assert mengalir == "Stok material SRRPAI adalah 250 PC."
    assert hasil.reply == "Stok material SRRPAI adalah 250 PC."


def test_teks_dikirim_bertahap_bukan_sekaligus(monkeypatch):
    model = FakeStreamingModel(["Bagian satu. ", "Bagian dua. ", "Bagian tiga."])
    _, token = asyncio.run(_jalankan(monkeypatch, model))

    isi = [t for t in token if t]
    assert len(isi) >= 3, f"hanya {len(isi)} event token; jawaban tidak mengalir"
    assert model.astream_dipanggil == 1
    assert model.ainvoke_dipanggil == 0, "streaming tidak boleh jatuh ke ainvoke"


def test_blok_penalaran_tidak_bocor_ke_layar(monkeypatch):
    """Model reasoning menuliskan <think>…</think> sebelum jawabannya."""
    model = FakeStreamingModel([
        "<think>", "Pengguna ", "menanyakan ", "stok.", "</think>",
        "Stok ", "tersedia ", "250 PC.",
    ])
    hasil, token = asyncio.run(_jalankan(monkeypatch, model))

    tampil = ""
    for t in token:
        tampil = "" if t is None else tampil + t

    assert "<think>" not in tampil
    assert "menanyakan" not in tampil, "isi penalaran internal tampil di layar"
    assert tampil.strip() == "Stok tersedia 250 PC."
    assert hasil.reply.strip() == "Stok tersedia 250 PC."


def test_tanpa_on_token_tetap_memakai_ainvoke(monkeypatch):
    """Endpoint /api/chat biasa tidak menyediakan on_token."""
    model = FakeStreamingModel(["Jawaban tanpa streaming."])
    hasil, token = asyncio.run(_jalankan(monkeypatch, model, kumpulkan_token=False))

    assert token == []
    assert model.ainvoke_dipanggil == 1
    assert model.astream_dipanggil == 0
    assert hasil.reply == "Jawaban tanpa streaming."


# --------------------------------------------------------------------------
# Statistik pemakaian (token, waktu, panggilan tool)
# --------------------------------------------------------------------------

class FakeModelDenganUsage(FakeStreamingModel):
    """Model yang melaporkan pemakaian token seperti provider sungguhan."""

    def __init__(self, potongan, usage):
        super().__init__(potongan)
        self.usage = usage

    def _pesan(self, teks, terakhir):
        chunk = AIMessageChunk(content=teks, tool_calls=[])
        if terakhir:
            chunk.usage_metadata = self.usage
        return chunk

    async def astream(self, msgs):
        self.astream_dipanggil += 1
        for i, teks in enumerate(self.potongan):
            yield self._pesan(teks, i == len(self.potongan) - 1)

    async def ainvoke(self, msgs):
        self.ainvoke_dipanggil += 1
        return self._pesan("".join(self.potongan), True)


def test_pemakaian_token_dilaporkan_apa_adanya_dari_provider(monkeypatch):
    usage = {
        "input_tokens": 16000,
        "output_tokens": 250,
        "total_tokens": 16250,
        "input_token_details": {"cache_read": 12000},
    }
    model = FakeModelDenganUsage(["Stok ", "250 PC."], usage)
    hasil, _ = asyncio.run(_jalankan(monkeypatch, model))

    assert hasil.usage is not None
    assert hasil.usage.prompt_tokens == 16000
    assert hasil.usage.completion_tokens == 250
    assert hasil.usage.total_tokens == 16250
    assert hasil.usage.cached_tokens == 12000
    assert hasil.usage.model == "model-uji"


def test_waktu_proses_selalu_terisi(monkeypatch):
    """Waktu diukur sendiri oleh server, jadi tersedia walau provider diam."""
    model = FakeStreamingModel(["Jawaban singkat."])
    hasil, _ = asyncio.run(_jalankan(monkeypatch, model))

    assert hasil.usage.latency_ms is not None
    assert hasil.usage.latency_ms >= 0


def test_token_dibiarkan_kosong_bila_provider_tidak_melaporkan(monkeypatch):
    """Perkiraan lokal akan meleset karena tokenizer tiap model berbeda;
    angka yang salah lebih menyesatkan daripada tidak ada angka."""
    model = FakeStreamingModel(["Jawaban tanpa metadata."])
    hasil, _ = asyncio.run(_jalankan(monkeypatch, model))

    assert hasil.usage.prompt_tokens is None
    assert hasil.usage.total_tokens is None
    assert hasil.usage.cached_tokens is None
