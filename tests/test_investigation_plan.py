"""Test untuk investigation plan — memastikan plan dihasilkan sesuai intent."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from analysis_policy import (
    classify_request,
    build_investigation_plan,
    InvestigationPlan,
    EvidenceRequirement,
)


def test_direct_intent_menghasilkan_plan_kosong():
    intent = classify_request("Apa itu MRP?")
    plan = build_investigation_plan(intent, "Apa itu MRP?")
    assert len(plan.requirements) == 0


def test_action_intent_menghasilkan_plan_kosong():
    intent = classify_request("Buatkan production order material 100-100")
    plan = build_investigation_plan(intent, "Buatkan production order material 100-100")
    assert len(plan.requirements) == 0


def test_grounded_lookup_sap_satu_requirement():
    intent = classify_request("Berapa stok material X di SAP?")
    plan = build_investigation_plan(intent, "Berapa stok material X di SAP?")
    assert len(plan.requirements) >= 1
    ids = [r.id for r in plan.requirements]
    assert "sap-primary" in ids


def test_grounded_lookup_sql_satu_requirement():
    intent = classify_request("Cek data tabel sql production_log")
    plan = build_investigation_plan(intent, "Cek data tabel sql production_log")
    assert len(plan.requirements) >= 1
    ids = [r.id for r in plan.requirements]
    assert "sql-primary" in ids


def test_deep_analysis_sap_memiliki_primary_dan_context():
    intent = classify_request("Analisa tren order terlambat tiga bulan terakhir")
    plan = build_investigation_plan(intent, "Analisa tren order terlambat tiga bulan terakhir")
    ids = [r.id for r in plan.requirements]
    assert "sap-primary" in ids
    assert "sap-context" in ids
    assert len(plan.requirements) >= 2


def test_deep_analysis_multi_source_sap_sql():
    intent = classify_request("Bandingkan nilai invoice SAP dengan tabel SQL")
    plan = build_investigation_plan(intent, "Bandingkan nilai invoice SAP dengan tabel SQL")
    ids = [r.id for r in plan.requirements]
    assert "sap-primary" in ids
    assert "sap-context" in ids
    assert "sql-primary" in ids
    assert "sql-context" in ids


def test_deep_analysis_rag_memiliki_primary_dan_context():
    intent = classify_request("Analisa SOP approval dari dokumen internal RAG")
    plan = build_investigation_plan(intent, "Analisa SOP approval dari dokumen internal RAG")
    ids = [r.id for r in plan.requirements]
    assert "rag-primary" in ids
    assert "rag-context" in ids


def test_plan_requirements_memiliki_purpose():
    intent = classify_request("Analisa tren stok material SAP 3 bulan")
    plan = build_investigation_plan(intent, "Analisa tren stok material SAP 3 bulan")
    for req in plan.requirements:
        assert req.purpose, f"Requirement {req.id} tidak memiliki purpose"
        assert req.source, f"Requirement {req.id} tidak memiliki source"


def test_plan_requirements_selalu_required_true():
    intent = classify_request("Berapa stok material di SAP?")
    plan = build_investigation_plan(intent, "Berapa stok material di SAP?")
    for req in plan.requirements:
        assert req.required is True
