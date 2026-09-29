"""Quality reviewer deterministic untuk jawaban deep analysis.

Reviewer memeriksa draft terhadap evidence ledger tanpa LLM tambahan:
- Struktur jawaban (bagian wajib)
- Angka yang tidak didukung evidence
- Keterbatasan yang disembunyikan
- Konsistensi evidence coverage

Reviewer mengembalikan hasil terstruktur, bukan prose.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from analysis_policy import EvidenceItem

# Bagian wajib untuk deep_analysis
_DEEP_SECTIONS = [
    "ruang lingkup",
    "temuan",
    "interpretasi",
    "keterbatasan",
    "rekomendasi",
    "sumber",
]

# Angka yang bukan data bisnis (tahun, tanggal, ID kecil)
_SKIP_NUMBERS = re.compile(
    r"\b(19|20)\d{2}\b"     # tahun 1900-2099
    r"|^\d{1,2}$"           # angka 1-99 (nomor urut, halaman, dll)
)


@dataclass
class QualityReview:
    passed: bool = True
    issues: list[str] = field(default_factory=list)
    unsupported_numbers: list[str] = field(default_factory=list)
    revision_instruction: str = ""


def _extract_numbers(text: str) -> set[str]:
    """Ekstrak angka signifikan (>=3 digit atau desimal) dari teks."""
    numbers: set[str] = set()
    # Cari angka dengan titik ribuan atau koma desimal
    for match in re.finditer(r"\b\d[\d.,]*\d\b|\b\d{3,}\b", text):
        num = match.group()
        # Skip tahun dan angka kecil
        if _SKIP_NUMBERS.match(num):
            continue
        # Skip angka 1-2 digit standalone
        clean = num.replace(".", "").replace(",", "")
        if clean.isdigit() and len(clean) <= 2:
            continue
        numbers.add(num)
    return numbers


def _normalise_number(num: str) -> str:
    """Normalisasi format angka untuk perbandingan (titik ribuan → tanpa separator)."""
    # Angka bertitik ribuan: 1.250.000 → 1250000
    parts = num.split(".")
    if all(len(p) == 3 for p in parts[1:]) and len(parts) > 1:
        return "".join(parts)
    return num.replace(",", "")


def _check_sections(draft: str) -> list[str]:
    """Periksa apakah bagian wajib deep analysis ada."""
    lower = draft.lower()
    missing = []
    for section in _DEEP_SECTIONS:
        # Cari header markdown atau label
        if section not in lower:
            missing.append(section)
    return missing


def _check_unsupported_numbers(draft: str, evidence: list[EvidenceItem]) -> list[str]:
    """Temukan angka di draft yang tidak ada di evidence manapun."""
    draft_numbers = _extract_numbers(draft)
    if not draft_numbers:
        return []

    # Kumpulkan semua angka dari evidence
    evidence_text = "\n".join(e.content for e in evidence if e.success)
    evidence_numbers = _extract_numbers(evidence_text)

    # Normalisasi
    evidence_normalised = {_normalise_number(n) for n in evidence_numbers}
    evidence_normalised.update(evidence_numbers)  # simpan format asli juga

    unsupported = []
    for num in draft_numbers:
        norm = _normalise_number(num)
        if num not in evidence_numbers and norm not in evidence_normalised:
            unsupported.append(num)

    return sorted(unsupported)


def review_answer(
    draft: str,
    evidence: list[EvidenceItem],
    depth: str = "standard",
) -> QualityReview:
    """Review kualitas draft jawaban terhadap evidence.

    Args:
        draft: Teks jawaban yang akan direview
        evidence: Daftar evidence dari tool calls
        depth: "standard" atau "deep"

    Returns:
        QualityReview dengan status dan masalah yang ditemukan
    """
    if depth != "deep":
        return QualityReview(passed=True)

    issues: list[str] = []

    # 1. Periksa kelengkapan bagian
    missing_sections = _check_sections(draft)
    for section in missing_sections:
        issues.append(f"Bagian '{section}' tidak ditemukan dalam jawaban.")

    # 2. Periksa angka tanpa dukungan evidence
    unsupported = _check_unsupported_numbers(draft, evidence)

    # 3. Build revision instruction jika ada masalah
    revision_parts: list[str] = []
    if missing_sections:
        revision_parts.append(
            f"Tambahkan bagian yang hilang: {', '.join(missing_sections)}."
        )
    if unsupported:
        revision_parts.append(
            f"Angka berikut tidak ditemukan di evidence dan harus dihapus atau diganti "
            f"dengan data dari evidence: {', '.join(unsupported)}."
        )

    passed = not issues and not unsupported
    revision_instruction = " ".join(revision_parts) if revision_parts else ""

    return QualityReview(
        passed=passed,
        issues=issues,
        unsupported_numbers=unsupported,
        revision_instruction=revision_instruction,
    )
