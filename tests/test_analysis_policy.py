"""Test untuk analysis_policy — Classifier intent dan policy evidence."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from analysis_policy import (
    classify_request,
    RequestIntent,
    EvidenceItem,
    EvidenceRequirement,
    InvestigationPlan,
    AnalysisState,
    build_investigation_plan,
    record_tool_evidence,
    evaluate_evidence_sufficiency,
    build_retry_instruction,
)


# ──────────────────────────────────────────────────────────────────────
# 1. classify_request  — aturan deterministik
# ──────────────────────────────────────────────────────────────────────

class TestClassifyDirect:
    """Permintaan umum yang boleh dijawab langsung tanpa tool."""

    @pytest.mark.parametrize("msg", [
        "Halo, selamat pagi",
        "Apa itu MRP?",
        "Tolong terjemahkan kalimat ini ke bahasa Inggris",
        "Buat ringkasan teks berikut: lorem ipsum dolor sit amet",
        "Siapa presiden Indonesia?",
        "Terima kasih",
    ])
    def test_direct_intent(self, msg):
        intent = classify_request(msg, target_server="sap")
        assert intent.kind == "direct"
        assert len(intent.required_sources) == 0

    def test_direct_with_attachment_context(self):
        """Pertanyaan tentang lampiran yang sudah ada di prompt → direct."""
        intent = classify_request(
            "Buat ringkasan dari dokumen yang saya lampirkan",
            target_server="sap",
            has_attachments=True,
        )
        assert intent.kind == "direct"


class TestClassifyGroundedLookup:
    """Permintaan fakta spesifik yang membutuhkan minimal satu bukti."""

    @pytest.mark.parametrize("msg,expected_source", [
        ("Berapa stok material 100001 di SAP?", "sap"),
        ("Tampilkan data PO 4500012345", "sap"),
        ("Cek status production order 1001234", "sap"),
        ("Lihat isi tabel MARA untuk material X", "sap"),
        ("Query jumlah record di tabel customers", "sql"),
        ("Cari dokumen SOP tentang approval PR", "rag"),
    ])
    def test_grounded_lookup(self, msg, expected_source):
        intent = classify_request(msg, target_server=expected_source)
        assert intent.kind == "grounded_lookup"
        assert expected_source in intent.required_sources

    def test_sql_target_forces_sql_source(self):
        intent = classify_request("Tampilkan data sales bulan ini", target_server="sql:prod")
        assert intent.kind in ("grounded_lookup", "deep_analysis")
        assert "sql" in intent.required_sources


class TestClassifyDeepAnalysis:
    """Permintaan analisis mendalam yang memerlukan beberapa bukti."""

    @pytest.mark.parametrize("msg", [
        "Analisa tren order terlambat tiga bulan terakhir dan penyebabnya",
        "Bandingkan nilai invoice SAP dengan tabel SQL",
        "Analisa SOP approval dari dokumen internal",
        "Kenapa banyak production order yang delay bulan ini?",
        "Investigasi anomali stok di gudang A vs gudang B",
        "Rekonsiliasi data penjualan SAP dengan laporan keuangan SQL",
        "Detail seluruh BOM untuk material 100001 beserta sub-assembly",
        "Berikan analisis lengkap performa vendor bulan ini",
    ])
    def test_deep_analysis(self, msg):
        intent = classify_request(msg, target_server="sap")
        assert intent.kind == "deep_analysis"
        assert len(intent.required_sources) >= 1

    def test_multi_source_analysis(self):
        """Analisis lintas sumber harus mencantumkan semua required_sources."""
        intent = classify_request(
            "Bandingkan nilai invoice SAP dengan tabel SQL",
            target_server="sap",
        )
        assert intent.kind == "deep_analysis"
        assert "sap" in intent.required_sources
        assert "sql" in intent.required_sources

    def test_rag_analysis(self):
        intent = classify_request(
            "Analisa SOP approval dari dokumen internal",
            target_server="rag",
        )
        assert intent.kind == "deep_analysis"
        assert "rag" in intent.required_sources


class TestClassifyAction:
    """Permintaan mutasi/pengiriman data."""

    @pytest.mark.parametrize("msg", [
        "Buatkan purchase order untuk material 100001",
        "Kirim email ke supplier tentang keterlambatan",
        "Buat production order baru untuk material X",
        "Forward email ini ke manager",
    ])
    def test_action_intent(self, msg):
        intent = classify_request(msg, target_server="sap")
        assert intent.kind == "action"


# ──────────────────────────────────────────────────────────────────────
# 2. build_investigation_plan
# ──────────────────────────────────────────────────────────────────────

class TestBuildInvestigationPlan:

    def test_direct_has_no_requirements(self):
        intent = RequestIntent(kind="direct", required_sources=[])
        plan = build_investigation_plan(intent, message="Halo")
        assert len(plan.requirements) == 0

    def test_grounded_lookup_has_requirements(self):
        intent = RequestIntent(kind="grounded_lookup", required_sources=["sap"])
        plan = build_investigation_plan(intent, message="Berapa stok material X?")
        assert len(plan.requirements) >= 1
        assert all(r.source in ("sap",) for r in plan.requirements)

    def test_deep_analysis_has_multiple_requirements(self):
        intent = RequestIntent(kind="deep_analysis", required_sources=["sap"])
        plan = build_investigation_plan(intent, message="Analisa tren order terlambat 3 bulan")
        assert len(plan.requirements) >= 2

    def test_multi_source_plan(self):
        intent = RequestIntent(kind="deep_analysis", required_sources=["sap", "sql"])
        plan = build_investigation_plan(intent, message="Bandingkan invoice SAP vs SQL")
        sources_in_plan = {r.source for r in plan.requirements}
        assert "sap" in sources_in_plan
        assert "sql" in sources_in_plan


# ──────────────────────────────────────────────────────────────────────
# 3. Evidence recording & sufficiency
# ──────────────────────────────────────────────────────────────────────

class TestEvidenceLedger:

    def _make_state(self, kind="grounded_lookup", sources=None):
        intent = RequestIntent(kind=kind, required_sources=sources or ["sap"])
        plan = build_investigation_plan(intent, message="test")
        return AnalysisState(intent=intent, plan=plan)

    def test_record_successful_evidence(self):
        state = self._make_state()
        ev = EvidenceItem(
            server="sap", tool="read_table", success=True,
            row_count=10, content="data baris SAP",
        )
        record_tool_evidence(state, ev)
        assert len(state.evidence) == 1
        assert state.evidence[0].success is True

    def test_record_failed_evidence(self):
        state = self._make_state()
        ev = EvidenceItem(
            server="sap", tool="read_table", success=False,
            error="RFC_ERROR_SYSTEM_FAILURE", content="",
        )
        record_tool_evidence(state, ev)
        assert len(state.evidence) == 1
        assert state.evidence[0].success is False

    def test_sufficiency_passes_with_evidence(self):
        state = self._make_state()
        ev = EvidenceItem(server="sap", tool="read_table", success=True, row_count=5, content="data")
        record_tool_evidence(state, ev)
        result = evaluate_evidence_sufficiency(state)
        assert result.passed is True

    def test_sufficiency_fails_without_evidence(self):
        state = self._make_state()
        result = evaluate_evidence_sufficiency(state)
        assert result.passed is False
        assert len(result.missing_sources) > 0

    def test_sufficiency_fails_with_only_errors(self):
        state = self._make_state()
        ev = EvidenceItem(server="sap", tool="read_table", success=False, error="timeout", content="")
        record_tool_evidence(state, ev)
        result = evaluate_evidence_sufficiency(state)
        assert result.passed is False

    def test_direct_always_passes(self):
        state = self._make_state(kind="direct", sources=[])
        result = evaluate_evidence_sufficiency(state)
        assert result.passed is True


# ──────────────────────────────────────────────────────────────────────
# 4. Retry instruction
# ──────────────────────────────────────────────────────────────────────

class TestRetryInstruction:

    def test_retry_mentions_missing_source(self):
        intent = RequestIntent(kind="grounded_lookup", required_sources=["sap"])
        plan = build_investigation_plan(intent, message="Cek stok")
        state = AnalysisState(intent=intent, plan=plan)
        result = evaluate_evidence_sufficiency(state)
        instruction = build_retry_instruction(state, result)
        assert isinstance(instruction, str)
        assert len(instruction) > 10
        assert "sap" in instruction.lower() or "SAP" in instruction

    def test_no_retry_for_direct(self):
        intent = RequestIntent(kind="direct", required_sources=[])
        plan = build_investigation_plan(intent, message="Halo")
        state = AnalysisState(intent=intent, plan=plan)
        result = evaluate_evidence_sufficiency(state)
        instruction = build_retry_instruction(state, result)
        assert instruction == ""
