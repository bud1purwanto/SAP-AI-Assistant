"""Test untuk RAG evidence budget adaptif berdasarkan intent classification."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from analysis_policy import classify_request, AnalysisState, build_investigation_plan


def _make_state(message: str, target_server: str = "all") -> AnalysisState:
    intent = classify_request(message, target_server=target_server)
    plan = build_investigation_plan(intent, message)
    return AnalysisState(intent=intent, plan=plan)


def test_direct_intent_rag_budget_nol():
    from analysis_policy import get_rag_budget
    state = _make_state("Apa itu MRP?")
    assert get_rag_budget(state) == 0


def test_grounded_lookup_rag_budget_default():
    from analysis_policy import get_rag_budget
    state = _make_state("Cari dokumen SOP approval di RAG")
    budget = get_rag_budget(state)
    assert 1 <= budget <= 3


def test_deep_analysis_rag_budget_lebih_besar():
    from analysis_policy import get_rag_budget
    state = _make_state("Analisa SOP approval dari dokumen RAG dan bandingkan versi lama")
    budget = get_rag_budget(state)
    assert budget >= 3


def test_non_rag_intent_tetap_punya_budget_minimal():
    from analysis_policy import get_rag_budget
    state = _make_state("Berapa stok material X di SAP?")
    budget = get_rag_budget(state)
    # SAP lookup tidak memerlukan RAG, budget = 0
    assert budget == 0


def test_multi_source_dengan_rag_punya_budget():
    from analysis_policy import get_rag_budget
    state = _make_state("Analisa data SAP dan bandingkan dengan dokumen RAG")
    budget = get_rag_budget(state)
    assert budget >= 2
