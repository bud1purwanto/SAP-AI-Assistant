"""Persona berlapis dan logika penyusunan prompt untuk model."""
import asyncio

import pytest

from models import ChatRequest

GLOBAL_PERSONA = "ATURAN ORGANISASI: selalu sebutkan tabel SAP sumber data."
USER_PERSONA = "PREFERENSI SAYA: jawab dalam bentuk poin."


def test_admin_sets_org_persona_and_user_adds_their_own(client, admin_auth, make_user):
    user = make_user("persona_user")
    assert client.post("/api/config", json={"global_assistant_persona": GLOBAL_PERSONA}, headers=admin_auth).status_code == 200
    assert client.post("/api/config", json={"assistant_persona": USER_PERSONA}, headers=user).status_code == 200

    cfg = client.get("/api/config", headers=user).json()
    assert cfg["global_assistant_persona"] == GLOBAL_PERSONA
    assert cfg["assistant_persona"] == USER_PERSONA


def test_normal_user_cannot_change_org_persona(client, admin_auth, make_user):
    user = make_user("persona_intruder")
    client.post("/api/config", json={"global_assistant_persona": GLOBAL_PERSONA}, headers=admin_auth)

    client.post("/api/config", json={"global_assistant_persona": "DIBAJAK"}, headers=user)
    assert client.get("/api/config", headers=admin_auth).json()["global_assistant_persona"] == GLOBAL_PERSONA


@pytest.fixture
def captured_prompt(db, monkeypatch):
    """Jalankan agen dengan LLM tiruan dan tangkap system prompt-nya."""
    import agent

    captured = {}

    class FakeTool:
        name = "read_table"
        description = "d"
        inputSchema = {"type": "object", "properties": {}}

    class FakeLLM:
        def bind_tools(self, *args, **kwargs):
            return self

        async def ainvoke(self, messages):
            captured["prompt"] = messages[0].content

            class Response:
                content = "Jawaban."
                tool_calls = []

            return Response()

    async def fake_tools(server_filter="all"):
        return [{"server": "sap", "tool": FakeTool()}, {"server": "rag", "tool": FakeTool()}]

    monkeypatch.setattr(agent.mcp_manager, "get_all_tools", fake_tools)
    monkeypatch.setattr(agent, "ChatOpenAI", lambda **kwargs: FakeLLM())

    def run(user_persona=""):
        asyncio.run(
            agent.process_chat(
                ChatRequest(message="halo", server="sap:sandbox-new"),
                "user",
                user_persona,
                username="andi",
            )
        )
        return captured["prompt"]

    return run


def test_org_persona_is_the_base_layer(captured_prompt, db):
    db.update_system_config(global_assistant_persona=GLOBAL_PERSONA)
    prompt = captured_prompt(USER_PERSONA)

    assert GLOBAL_PERSONA in prompt and USER_PERSONA in prompt
    # Persona organisasi harus mendahului preferensi pribadi.
    assert prompt.index(GLOBAL_PERSONA) < prompt.index(USER_PERSONA)
    assert "preferensi pribadi yang menang" in prompt
    assert "keakuratan data, keamanan, atau kepatuhan" in prompt


def test_user_persona_applies_without_an_org_persona(captured_prompt, db):
    db.update_system_config(global_assistant_persona="")
    from config import settings

    settings.assistant_persona = ""
    assert "HANYA PRIBADI" in captured_prompt("HANYA PRIBADI")


def test_prompt_allows_answering_without_sap_tools(captured_prompt, db):
    """Prompt lama mewajibkan setiap balasan memanggil tool SAP."""
    prompt = captured_prompt("")
    assert "JAWAB LANGSUNG" in prompt
    assert "Untuk jawaban yang TIDAK mengambil data SAP, JANGAN tampilkan baris tersebut" in prompt
    assert "MEMBUAT BERKAS" in prompt
