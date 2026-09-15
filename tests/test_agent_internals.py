"""Perilaku internal agen: pembersihan keluaran dan keamanan konkurensi."""
import asyncio

from agent import _clean_thinking_process


def test_content_before_an_emoji_is_kept():
    """Kode lama memotong teks pada kemunculan pertama emoji."""
    text = "Halo! Berikut ringkasannya.\n\n📦 Paket dikirim besok.\n\nTerima kasih."
    assert _clean_thinking_process(text).startswith("Halo!")


def test_think_blocks_are_stripped():
    assert _clean_thinking_process("<think>rahasia</think>Jawaban akhir.") == "Jawaban akhir."


def test_legitimate_english_is_preserved():
    text = "This is a legitimate English answer the user asked for. It stays."
    assert _clean_thinking_process(text) == text


def test_sap_target_and_tool_call_stay_paired_under_concurrency():
    """Server MCP SAP menyimpan target aktif sebagai state global.

    Bila penetapan target dan pemanggilan tool tidak atomik, permintaan user
    lain dapat menyisip dan query dieksekusi ke sistem SAP yang salah.
    """
    from mcp_manager import MCPCallResult, MCPContentItem, MCPManager

    order = []

    class FakeClient:
        async def call_tool(self, http, name, args):
            if name == "set_active_server":
                order.append(("set", args["server_ref"]))
                await asyncio.sleep(0.01)  # jendela tempat request lain bisa menyisip
            else:
                order.append(("call", name))
            return MCPCallResult(content=[MCPContentItem(text="ok")])

    manager = MCPManager()
    manager.get_client = lambda name: FakeClient()

    async def run():
        await asyncio.gather(
            manager.call_tool("sap", "read_table", {}, sap_target="sandbox"),
            manager.call_tool("sap", "read_table", {}, sap_target="production"),
        )

    asyncio.run(run())

    pairs = [order[i : i + 2] for i in range(0, len(order), 2)]
    assert all(p[0][0] == "set" and p[1][0] == "call" for p in pairs), order


def test_call_result_exposes_is_error():
    """agent.py membaca is_error sementara kelasnya hanya menyetel isError."""
    from mcp_manager import MCPCallResult

    result = MCPCallResult(content=[], is_error=True)
    assert result.is_error is True and result.isError is True


def test_tool_catalogs_are_fetched_concurrently():
    """SAP dan RAG tidak boleh ditunggu berurutan sebelum model dipanggil."""
    from mcp_manager import MCPManager, MCPTool

    running = 0
    peak = 0

    class FakeClient:
        async def list_tools(self, http):
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.01)
            running -= 1
            return [MCPTool("read")]

    manager = MCPManager()
    manager.get_client = lambda name: FakeClient()

    async def run():
        return await manager.get_all_tools(
            server_filter="sap", allowed_connectors={"sap", "rag"}
        )

    result = asyncio.run(run())
    assert peak == 2
    assert {item["server"] for item in result} == {"sap", "rag"}
