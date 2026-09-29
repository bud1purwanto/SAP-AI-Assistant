"""Validator evidence per domain (SAP, SQL, RAG).

Setiap validator menerima output tool mentah dan menghasilkan EvidenceItem
dalam format yang konsisten.
"""
from __future__ import annotations

import json
import re
from analysis_policy import EvidenceItem


def _safe_row_count(content: str) -> int | None:
    """Hitung jumlah baris dari output tabel; None jika tidak bisa ditentukan."""
    if not content:
        return 0
    # Cari pola JSON array
    try:
        data = json.loads(content)
        if isinstance(data, list):
            return len(data)
        if isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list):
                    return len(v)
    except (json.JSONDecodeError, ValueError):
        pass
    # Cari pola tabel markdown
    lines = [l for l in content.strip().splitlines() if l.strip() and not l.strip().startswith("---")]
    if lines:
        return max(0, len(lines) - 1)  # header row
    return None


_SAP_ERROR_PATTERNS = re.compile(
    r"(RFC_ERROR|TABLE_NOT_FOUND|FIELD_NOT_FOUND|NOT_AUTHORIZED|"
    r"System Error|Exception|Execution Error|DATA_BUFFER_EXCEEDED)", re.I
)
_TRUNCATED = re.compile(r"(truncat|dipotong|terpotong|more rows|MAX_ROWS)", re.I)


def validate_sap_evidence(
    tool: str,
    content: str,
    is_error: bool = False,
    args: dict | None = None,
) -> EvidenceItem:
    error = ""
    if is_error:
        error = content[:300] if content else "Unknown SAP error"
    elif _SAP_ERROR_PATTERNS.search(content or ""):
        is_error = True
        match = _SAP_ERROR_PATTERNS.search(content or "")
        error = match.group(0) if match else "SAP error detected"
    row_count = _safe_row_count(content) if not is_error else None
    truncated = bool(_TRUNCATED.search(content or ""))
    return EvidenceItem(
        server="sap",
        tool=tool,
        success=not is_error and bool((content or "").strip()),
        content=content or "",
        row_count=row_count,
        truncated=truncated,
        error=error,
        signature=_build_sig(tool, args),
    )


def validate_sql_evidence(
    tool: str,
    content: str,
    is_error: bool = False,
    args: dict | None = None,
) -> EvidenceItem:
    error = ""
    if is_error:
        error = content[:300] if content else "Unknown SQL error"
    row_count = _safe_row_count(content) if not is_error else None
    truncated = bool(_TRUNCATED.search(content or ""))
    return EvidenceItem(
        server="sql",
        tool=tool,
        success=not is_error and bool((content or "").strip()),
        content=content or "",
        row_count=row_count,
        truncated=truncated,
        error=error,
        signature=_build_sig(tool, args),
    )


_RAG_FOUND = re.compile(r'"status"\s*:\s*"found"', re.I)


def validate_rag_evidence(
    tool: str,
    content: str,
    is_error: bool = False,
    args: dict | None = None,
) -> EvidenceItem:
    error = ""
    if is_error:
        error = content[:300] if content else "Unknown RAG error"
    found = bool(_RAG_FOUND.search(content or "")) if not is_error else False
    doc_count = None
    if not is_error and content:
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                sources = data.get("sources") or data.get("results") or data.get("documents")
                if isinstance(sources, list):
                    doc_count = len(sources)
        except (json.JSONDecodeError, ValueError):
            pass
    return EvidenceItem(
        server="rag",
        tool=tool,
        success=not is_error and (found or bool((content or "").strip())),
        content=content or "",
        document_count=doc_count,
        error=error,
        signature=_build_sig(tool, args),
    )


def validate_evidence(
    server: str,
    tool: str,
    content: str,
    is_error: bool = False,
    args: dict | None = None,
) -> EvidenceItem:
    """Dispatcher: panggil validator per domain."""
    s = server.lower()
    if s == "sap":
        return validate_sap_evidence(tool, content, is_error, args)
    if s in ("sql", "database"):
        return validate_sql_evidence(tool, content, is_error, args)
    if s == "rag":
        return validate_rag_evidence(tool, content, is_error, args)
    # fallback generik
    return EvidenceItem(
        server=server,
        tool=tool,
        success=not is_error and bool((content or "").strip()),
        content=content or "",
        error=content[:300] if is_error else "",
        signature=_build_sig(tool, args),
    )


def _build_sig(tool: str, args: dict | None) -> str:
    try:
        return f"{tool}:{json.dumps(args or {}, sort_keys=True)}"
    except Exception:
        return f"{tool}:{args}"
