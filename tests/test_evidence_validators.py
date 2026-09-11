"""Test untuk evidence_validators — SAP, SQL, RAG."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import json
import pytest
from evidence_validators import (
    validate_sap_evidence,
    validate_sql_evidence,
    validate_rag_evidence,
    validate_evidence,
)


class TestSAPValidator:

    def test_success_with_data(self):
        data = json.dumps([{"MATNR": "100001", "MAKTX": "Material A"}])
        ev = validate_sap_evidence("read_table", data)
        assert ev.success is True
        assert ev.row_count == 1
        assert ev.error == ""

    def test_error_flag(self):
        ev = validate_sap_evidence("read_table", "RFC_ERROR_SYSTEM_FAILURE", is_error=True)
        assert ev.success is False
        assert "RFC_ERROR" in ev.error

    def test_error_detected_in_content(self):
        ev = validate_sap_evidence("read_table", "TABLE_NOT_FOUND: ZXXX does not exist")
        assert ev.success is False
        assert ev.error != ""

    def test_empty_content(self):
        ev = validate_sap_evidence("read_table", "")
        assert ev.success is False
        assert ev.row_count == 0

    def test_truncated_detection(self):
        ev = validate_sap_evidence("read_table", '[{"A":"1"}]\n... truncated, more rows available')
        assert ev.truncated is True

    def test_multi_row(self):
        rows = [{"MATNR": f"M{i}"} for i in range(50)]
        ev = validate_sap_evidence("read_table", json.dumps(rows))
        assert ev.row_count == 50
        assert ev.success is True


class TestSQLValidator:

    def test_success(self):
        data = json.dumps({"rows": [{"id": 1}, {"id": 2}]})
        ev = validate_sql_evidence("sql_run_query", data)
        assert ev.success is True

    def test_error(self):
        ev = validate_sql_evidence("sql_run_query", "Syntax error near SELECT", is_error=True)
        assert ev.success is False

    def test_empty(self):
        ev = validate_sql_evidence("sql_run_query", "")
        assert ev.success is False


class TestRAGValidator:

    def test_found(self):
        data = json.dumps({"status": "found", "answer": "Prosedur approval...", "sources": [{"doc": "SOP-01"}]})
        ev = validate_rag_evidence("rag_answer", data)
        assert ev.success is True
        assert ev.document_count == 1

    def test_not_found(self):
        ev = validate_rag_evidence("rag_answer", json.dumps({"status": "not_found"}))
        # content tidak kosong tapi status not_found — masih success karena ada konten
        assert ev.success is True

    def test_error(self):
        ev = validate_rag_evidence("rag_search", "Connection refused", is_error=True)
        assert ev.success is False


class TestDispatcher:

    def test_sap_dispatch(self):
        ev = validate_evidence("sap", "read_table", '[{"X":"1"}]')
        assert ev.server == "sap"
        assert ev.success is True

    def test_sql_dispatch(self):
        ev = validate_evidence("sql", "sql_run_query", '[{"id":1}]')
        assert ev.server == "sql"
        assert ev.success is True

    def test_rag_dispatch(self):
        ev = validate_evidence("rag", "rag_answer", '{"status":"found","answer":"ok"}')
        assert ev.server == "rag"
        assert ev.success is True

    def test_unknown_server(self):
        ev = validate_evidence("email", "search_emails", "result data")
        assert ev.server == "email"
        assert ev.success is True
