"""Test quality reviewer untuk jawaban deep analysis."""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from analysis_policy import EvidenceItem
from answer_quality import review_answer, QualityReview


def _evidence(content: str = "Total order: 120\nTerlambat: 15\nPeriode: Juni-Agustus 2026"):
    return [EvidenceItem(server="sap", tool="read_table", success=True, content=content, row_count=2)]


def test_direct_answer_tidak_memerlukan_struktur_deep():
    result = review_answer("MRP adalah perencanaan kebutuhan material.", [], depth="standard")
    assert result.passed is True


def test_deep_answer_lengkap_lulus():
    draft = """## Ruang Lingkup & Filter
Periode Juni-Agustus 2026.
## Temuan Berbasis Data
Total order 120, terlambat 15.
## Interpretasi
Keterlambatan terkonsentrasi pada periode tersebut.
## Keterbatasan
Data penyebab detail belum tersedia.
## Rekomendasi
Lakukan drill-down pada order terlambat.
## Sumber
SAP read_table.
"""
    result = review_answer(draft, _evidence(), depth="deep")
    assert result.passed is True
    assert result.issues == []


def test_deep_answer_tanpa_keterbatasan_gagal():
    draft = """## Ruang Lingkup & Filter
Periode tiga bulan.
## Temuan Berbasis Data
Total order 120.
## Interpretasi
Ada tren.
## Rekomendasi
Perbaiki proses.
## Sumber
SAP.
"""
    result = review_answer(draft, _evidence(), depth="deep")
    assert result.passed is False
    assert any("keterbatasan" in issue.lower() for issue in result.issues)


def test_angka_tidak_ada_di_evidence_dideteksi():
    draft = """## Ruang Lingkup & Filter
Juni-Agustus 2026.
## Temuan Berbasis Data
Total order 999 dan terlambat 15.
## Interpretasi
Ada keterlambatan.
## Keterbatasan
Data terbatas.
## Rekomendasi
Drill-down.
## Sumber
SAP.
"""
    result = review_answer(draft, _evidence(), depth="deep")
    assert result.passed is False
    assert "999" in result.unsupported_numbers


def test_angka_format_ribuan_dinormalisasi():
    evidence = _evidence("Total nilai: 1.250.000 IDR")
    draft = """## Ruang Lingkup & Filter
Semua transaksi.
## Temuan Berbasis Data
Total nilai 1.250.000 IDR.
## Interpretasi
Nilai material.
## Keterbatasan
Tidak ada pembanding.
## Rekomendasi
Bandingkan periode lain.
## Sumber
SAP.
"""
    result = review_answer(draft, evidence, depth="deep")
    assert "1.250.000" not in result.unsupported_numbers


def test_quality_review_memberi_instruction_revisi():
    result = review_answer("Jawaban tanpa struktur dengan angka 555.", _evidence(), depth="deep")
    assert result.passed is False
    assert result.revision_instruction
    assert "555" in result.unsupported_numbers


def test_tanggal_periode_evidence_tidak_dianggap_unsupported():
    draft = """## Ruang Lingkup & Filter
Periode Juni-Agustus 2026.
## Temuan Berbasis Data
Total order 120.
## Interpretasi
Ada tren.
## Keterbatasan
Data parsial.
## Rekomendasi
Validasi lanjut.
## Sumber
SAP.
"""
    result = review_answer(draft, _evidence(), depth="deep")
    assert "2026" not in result.unsupported_numbers
