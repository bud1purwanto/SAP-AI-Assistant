"""Permintaan RAG tanpa izin harus mendapat arahan akses tanpa memanggil model."""
import asyncio

import agent
from models import ChatRequest


def test_sop_terkunci_mengarahkan_permohonan_akses(monkeypatch):
    def unexpected_model(*args, **kwargs):
        raise AssertionError("Model tidak boleh dipanggil saat akses RAG terkunci")

    monkeypatch.setattr(agent, "_buat_llm", unexpected_model)
    response = asyncio.run(agent.process_chat(ChatRequest(
        message="/sop cara cancel slit roll",
        enabled_connectors=["sap"],
        locked_connectors=["rag"],
        language="id",
    )))
    assert "belum memiliki akses" in response.reply
    assert "ajukan permintaan akses" in response.reply
    assert "offline" not in response.reply.lower()


def test_rag_locked_message_supports_english():
    response = asyncio.run(agent.process_chat(ChatRequest(
        message="/rag slitting procedure",
        locked_connectors=["rag"],
        language="en",
    )))
    assert "request access" in response.reply.lower()
    assert "offline" not in response.reply.lower()


def test_sop_without_rag_tools_does_not_guess_documents(monkeypatch):
    async def no_tools(**kwargs):
        return []

    def unexpected_model(*args, **kwargs):
        raise AssertionError("Model tidak boleh dipanggil tanpa tool RAG")

    monkeypatch.setattr(agent.mcp_manager, "get_all_tools", no_tools)
    monkeypatch.setattr(agent, "_buat_llm", unexpected_model)
    response = asyncio.run(agent.process_chat(ChatRequest(
        message="/sop cari list di folder IT/SAP/ABAP",
        active_server="general",
        enabled_connectors=["rag"],
        language="id",
    )))
    assert "belum bisa diverifikasi" in response.reply
    assert response.sources == []
