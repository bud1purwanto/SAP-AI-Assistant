"""Susunan prompt terhadap cache milik provider.

Cache prompt bekerja atas AWALAN yang sama persis. Selama bagian yang
berubah-ubah (nama server SAP, role, persona pribadi) berada di baris pertama,
setiap kombinasi user/server menjadi prompt yang berbeda sejak karakter pertama
— dan bagian stabilnya yang belasan ribu token tidak pernah dapat dipakai ulang.

Tes ini menjaga susunannya: bagian stabil di depan, konteks per permintaan di
belakang.
"""
import asyncio
import os

from langchain_core.messages import AIMessageChunk

import agent as agent_module
from models import ChatRequest


class ModelPerekamPrompt:
    """Menangkap system prompt yang benar-benar dikirim ke model."""

    def __init__(self):
        self.prompt = None

    def _rekam(self, msgs):
        self.prompt = msgs[0].content

    async def astream(self, msgs):
        self._rekam(msgs)
        yield AIMessageChunk(content="Jawaban singkat.", tool_calls=[])

    async def ainvoke(self, msgs):
        self._rekam(msgs)
        return AIMessageChunk(content="Jawaban singkat.", tool_calls=[])

    def bind_tools(self, tools, **kwargs):
        return self


def _prompt_untuk(monkeypatch, *, role="user", persona="", server="sap:sandbox-new"):
    model = ModelPerekamPrompt()

    async def fake_tools(server_filter=None):
        t = type("T", (), {"name": "read_table", "description": "baca", "inputSchema": {}})()
        return [{"server": "sap", "tool": t}]

    monkeypatch.setattr(agent_module.mcp_manager, "get_all_tools", fake_tools)
    monkeypatch.setattr(agent_module, "ChatOpenAI", lambda **kw: model)

    import database
    monkeypatch.setattr(database, "get_system_config", lambda: {
        "nine_router_enabled": True,
        "nine_router_api_key": "kunci-uji",
        "nine_router_base_url": "http://contoh.invalid/v1",
        "nine_router_model": "model-uji",
        "openrouter_enabled": False,
        "global_assistant_persona": "Jawab ringkas dan profesional.",
    })

    asyncio.run(agent_module.process_chat(
        ChatRequest(message="cek stok", active_server=server),
        role,
        persona,
        username="penguji",
    ))
    return model.prompt


def _awalan_sama(a: str, b: str) -> int:
    """Panjang awalan identik antara dua prompt."""
    batas = min(len(a), len(b))
    for i in range(batas):
        if a[i] != b[i]:
            return i
    return batas


def test_awalan_sama_untuk_role_yang_berbeda(monkeypatch, db):
    a = _prompt_untuk(monkeypatch, role="user")
    b = _prompt_untuk(monkeypatch, role="superadmin")

    sama = _awalan_sama(a, b)
    assert sama > 2000, (
        f"hanya {sama} karakter pertama yang sama; bagian yang berubah per "
        "pengguna bocor ke bagian awal prompt"
    )
    # Titik perbedaan tidak boleh berada SEBELUM bagian konteks dimulai:
    # selama masih di dalam aturan, berarti ada nilai per-permintaan yang
    # tercampur ke bagian yang seharusnya stabil.
    mulai_konteks = a.index("## KONTEKS PERMINTAAN INI")
    assert sama >= mulai_konteks, (
        f"prompt sudah berbeda pada karakter ke-{sama}, padahal bagian konteks "
        f"baru mulai di karakter ke-{mulai_konteks}"
    )


def test_awalan_sama_untuk_persona_pribadi_yang_berbeda(monkeypatch, db):
    a = _prompt_untuk(monkeypatch, persona="")
    b = _prompt_untuk(monkeypatch, persona="Selalu balas dalam bentuk poin.")
    assert _awalan_sama(a, b) > 2000


def test_awalan_sama_untuk_server_sap_yang_berbeda(monkeypatch, db):
    a = _prompt_untuk(monkeypatch, server="sap:sandbox-new")
    b = _prompt_untuk(monkeypatch, server="sap:production")
    assert _awalan_sama(a, b) > 2000


def test_bagian_stabil_jauh_lebih_besar_daripada_konteks(monkeypatch, db):
    """Manfaat caching bergantung pada porsi yang stabil."""
    prompt = _prompt_untuk(monkeypatch)
    posisi = prompt.index("## KONTEKS PERMINTAAN INI")
    stabil, konteks = posisi, len(prompt) - posisi

    assert stabil > konteks * 5, (
        f"bagian stabil {stabil} karakter vs konteks {konteks} karakter — "
        "porsi yang dapat di-cache terlalu kecil"
    )


def test_konteks_memuat_keterangan_yang_dibutuhkan(monkeypatch, db):
    """Nama server dipindahkan ke belakang; ia tetap harus sampai ke model."""
    prompt = _prompt_untuk(monkeypatch, role="superadmin", persona="Pakai bahasa santai.")
    konteks = prompt[prompt.index("## KONTEKS PERMINTAAN INI"):]

    assert "Role pengguna: superadmin" in konteks
    assert "Sistem SAP aktif" in konteks
    assert "Pakai bahasa santai." in konteks
