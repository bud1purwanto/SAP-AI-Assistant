"""Test strategi investigasi per domain."""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from analysis_policy import classify_request, build_investigation_plan
from analysis_strategies import build_strategy_guidance


def _guidance(message: str) -> str:
    intent = classify_request(message)
    plan = build_investigation_plan(intent, message)
    return build_strategy_guidance(intent, plan)


def test_direct_tidak_mendapat_strategi_tool():
    assert _guidance("Apa itu MRP?") == ""


def test_sap_menganjurkan_metadata_filter_dan_paging():
    text = _guidance("Analisa tren stok material SAP tiga bulan")
    assert "struktur" in text.lower() or "metadata" in text.lower()
    assert "filter" in text.lower()
    assert "paging" in text.lower()


def test_sql_menganjurkan_read_only_dan_agregat():
    text = _guidance("Analisa tren dari tabel SQL production_log")
    assert "read-only" in text.lower()
    assert "agregat" in text.lower()


def test_rag_menganjurkan_kandidat_dan_kutipan():
    text = _guidance("Analisa perbedaan SOP dari dokumen RAG")
    assert "kandidat" in text.lower()
    assert "kutipan" in text.lower()


def test_multi_source_menganjurkan_normalisasi():
    text = _guidance("Bandingkan invoice SAP dengan tabel SQL")
    assert "normalisasi" in text.lower()
    assert "periode" in text.lower()
    assert "unit" in text.lower()
