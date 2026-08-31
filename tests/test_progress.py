"""Progres jawaban: tahapan dilaporkan selama permintaan diproses."""
import asyncio
import json

import pytest

from models import ChatResponse


def _parse_events(raw: str):
    return [json.loads(line[6:]) for line in raw.splitlines() if line.startswith("data: ")]


@pytest.fixture
def slow_agent(monkeypatch):
    """Agen tiruan yang melaporkan beberapa tahap sebelum selesai."""
    import main

    async def fake_process(chat_req, role, persona, username="Guest", on_progress=None, on_token=None):
        for stage, label, step in [
            ("connecting", "Menyiapkan permintaan…", 0),
            ("thinking", "Menganalisis pertanyaan…", 1),
            ("tool", "Membaca tabel MARC di SAP…", 1),
            ("thinking", "Menyusun jawaban dari data…", 2),
        ]:
            if on_progress:
                await on_progress(stage=stage, label=label, step=step, max_steps=6)
            await asyncio.sleep(0)
        return ChatResponse(reply="Stok 250 PC.", sources=[], artifacts=[])

    monkeypatch.setattr(main, "process_chat", fake_process)


def test_stream_reports_stages_then_result(client, make_user, slow_agent):
    auth = make_user("prog_user")
    with client.stream("POST", "/api/chat/stream", json={"message": "cek stok"}, headers=auth) as res:
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
        events = _parse_events("".join(res.iter_text()))

    progress = [e for e in events if e["type"] == "progress"]
    results = [e for e in events if e["type"] == "result"]

    assert len(progress) >= 4, progress
    assert [e["stage"] for e in progress][:2] == ["connecting", "thinking"]
    assert any("MARC" in e["label"] for e in progress), "tahap tool harus menyebut yang dibaca"
    assert len(results) == 1 and results[0]["data"]["reply"] == "Stok 250 PC."


def test_stream_progress_carries_step_numbers(client, make_user, slow_agent):
    auth = make_user("prog_step")
    with client.stream("POST", "/api/chat/stream", json={"message": "cek stok"}, headers=auth) as res:
        events = _parse_events("".join(res.iter_text()))

    steps = [e["step"] for e in events if e["type"] == "progress"]
    assert max(steps) <= 6 and steps == sorted(steps), steps
    assert all(e["max_steps"] == 6 for e in events if e["type"] == "progress")


def test_stream_reports_errors_as_events(client, make_user, monkeypatch):
    """Kegagalan harus sampai ke klien, bukan memutus koneksi begitu saja."""
    import main

    async def failing(chat_req, role, persona, username="Guest", on_progress=None, on_token=None):
        raise RuntimeError("model tidak tersedia")

    monkeypatch.setattr(main, "process_chat", failing)

    auth = make_user("prog_error")
    with client.stream("POST", "/api/chat/stream", json={"message": "halo"}, headers=auth) as res:
        events = _parse_events("".join(res.iter_text()))

    errors = [e for e in events if e["type"] == "error"]
    assert len(errors) == 1 and errors[0]["status"] == 500


def test_agent_reports_real_stages(db, monkeypatch):
    """Tahapan berasal dari pekerjaan yang benar-benar dilakukan agen."""
    import agent
    from models import ChatRequest

    class FakeTool:
        name = "read_table"
        description = "d"
        inputSchema = {"type": "object", "properties": {}}

    class FakeLLM:
        def bind_tools(self, *args, **kwargs):
            return self

        async def ainvoke(self, messages):
            class Response:
                content = "Jawaban."
                tool_calls = []

            return Response()

    async def fake_tools(server_filter="all"):
        return [{"server": "sap", "tool": FakeTool()}]

    monkeypatch.setattr(agent.mcp_manager, "get_all_tools", fake_tools)
    monkeypatch.setattr(agent, "ChatOpenAI", lambda **kwargs: FakeLLM())

    seen = []

    async def collect(**event):
        seen.append(event)

    asyncio.run(
        agent.process_chat(
            ChatRequest(message="halo"), "user", "", username="andi", on_progress=collect
        )
    )

    stages = [e["stage"] for e in seen]
    assert stages[0] == "connecting" and stages[-1] == "done"
    assert "thinking" in stages


def test_tool_stage_names_the_table_being_read():
    """Keterangan progres memakai bahasa kerja, bukan nama tool internal."""
    from agent import _describe_tool

    assert _describe_tool("sap", "read_table", {"table": "MARC"}) == "Membaca tabel MARC di SAP…"
    assert _describe_tool("sap", "sap_read_table", {"table_name": "MARA"}) == "Membaca tabel MARA di SAP…"
    assert _describe_tool("rag", "search", {}) == "Mencari di dokumen internal…"
    assert "ABAP" in _describe_tool("sap", "read_program", {})
