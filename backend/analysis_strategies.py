"""Panduan strategi investigasi per domain.

Setiap domain mempunyai pola query dan validasi yang berbeda. Modul ini
menghasilkan instruksi ringkas untuk disuntikkan ke konteks agent agar
model tahu cara mendekati sumber data dengan benar.
"""
from __future__ import annotations

from analysis_policy import RequestIntent, InvestigationPlan

_SAP_GUIDANCE = (
    "Strategi SAP:\n"
    "- Periksa metadata/struktur tabel dahulu bila field tidak pasti.\n"
    "- Gunakan filter ROWCOUNT/OPTIONS dan paging agar tidak full-table scan.\n"
    "- Pisahkan query header, item, status, dan transaksi pendukung.\n"
    "- Verifikasi UoM/currency sebelum membandingkan nilai lintas dokumen."
)

_SQL_GUIDANCE = (
    "Strategi SQL:\n"
    "- Semua query wajib read-only (SELECT/metadata) untuk analisis.\n"
    "- Gunakan query agregat (COUNT, SUM, AVG) dahulu untuk gambaran umum.\n"
    "- Drill-down hanya untuk anomali yang ditemukan di agregat.\n"
    "- Cek metadata kolom bila skema ambigu."
)

_RAG_GUIDANCE = (
    "Strategi RAG:\n"
    "- Mulai dengan pencarian kandidat dokumen yang relevan.\n"
    "- Lanjutkan dengan konteks halaman untuk kutipan akurat.\n"
    "- Deteksi konflik atau keterbatasan antar sumber.\n"
    "- Sertakan kutipan spesifik sebagai evidence."
)

_MULTI_SOURCE_GUIDANCE = (
    "Strategi multi-sumber:\n"
    "- Normalisasi key, periode, unit, timezone, dan grain sebelum "
    "perbandingan lintas sumber.\n"
    "- Gunakan identifier yang sama (material number, document number) "
    "sebagai join key."
)


def build_strategy_guidance(intent: RequestIntent, plan: InvestigationPlan) -> str:
    """Bangun panduan query berdasarkan sumber dan kedalaman analisis.

    Returns:
        String panduan kosong untuk intent direct, atau gabungan panduan
        per domain yang ditemukan di required_sources.
    """
    if intent.kind == "direct":
        return ""

    parts: list[str] = []
    sources = {s.lower() for s in intent.required_sources}

    if "sap" in sources:
        parts.append(_SAP_GUIDANCE)
    if "sql" in sources:
        parts.append(_SQL_GUIDANCE)
    if "rag" in sources:
        parts.append(_RAG_GUIDANCE)

    if len(sources) > 1:
        parts.append(_MULTI_SOURCE_GUIDANCE)

    return "\n\n".join(parts)
