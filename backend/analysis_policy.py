"""Kebijakan analisis berbasis bukti untuk agent SAP/SQL/RAG.

Modul ini sengaja deterministik: klasifikasi umum tidak membutuhkan panggilan
LLM tambahan, sehingga permintaan sederhana tetap cepat.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Literal

IntentKind = Literal["direct", "grounded_lookup", "deep_analysis", "action"]


@dataclass
class RequestIntent:
    kind: IntentKind
    required_sources: list[str] = field(default_factory=list)
    depth: str = "standard"
    needs_live_data: bool = False
    requested_dimensions: list[str] = field(default_factory=list)
    time_range: str = ""
    entities: list[str] = field(default_factory=list)
    confidence: float = 1.0


@dataclass
class EvidenceRequirement:
    id: str
    source: str
    purpose: str
    required: bool = True


@dataclass
class InvestigationPlan:
    requirements: list[EvidenceRequirement] = field(default_factory=list)


@dataclass
class EvidenceItem:
    server: str
    tool: str
    success: bool
    content: str = ""
    signature: str = ""
    row_count: int | None = None
    document_count: int | None = None
    truncated: bool = False
    error: str = ""
    source_ids: list[str] = field(default_factory=list)


@dataclass
class QualityGateResult:
    passed: bool
    status: str = "complete"
    missing_sources: list[str] = field(default_factory=list)
    missing_requirements: list[str] = field(default_factory=list)


@dataclass
class AnalysisState:
    intent: RequestIntent
    plan: InvestigationPlan
    evidence: list[EvidenceItem] = field(default_factory=list)
    tool_errors: list[str] = field(default_factory=list)
    gate_retries: int = 0
    review_count: int = 0


_DEEP = re.compile(
    r"\b(anal(?:isa|isis)|bandingkan|perbandingan|tren|penyebab|kenapa|mengapa|"
    r"investigasi|anomali|rekonsiliasi|root cause|akar masalah|detail|lengkap|"
    r"performa|evaluasi|korelasi|drill.?down)\b", re.I
)
_ACTION = re.compile(
    r"\b(buat(?:kan)?|create|kirim|send|forward|teruskan|ubah|update|hapus|delete|"
    r"batalkan|cancel|posting|release)\b", re.I
)
_LOOKUP = re.compile(
    r"\b(berapa|tampilkan|lihat|cek|check|cari|query|ambil|status|isi tabel|"
    r"data|stok|stock|record|dokumen|purchase order|production order|invoice)\b", re.I
)
_RAG = re.compile(r"\b(rag|dokumen internal|sop|blueprint|manual|kebijakan|prosedur)\b", re.I)
_SQL = re.compile(r"\b(sql|database|tabel sql|query)\b", re.I)
_SAP = re.compile(
    r"\b(sap|material|stok|stock|purchase order|production order|invoice|vendor|"
    r"bom|mrp|mara|marc|mard|aufk|ekko|ekpo|tcode)\b", re.I
)
_ATTACHMENT = re.compile(r"\b(lampiran|dokumen yang saya lampirkan|file ini|teks berikut)\b", re.I)
_EXPLICIT_LIVE_SOURCE = re.compile(
    r"\b(di|dari|ke|pada)\s+(sap|database|sql|rag)\b|\b(tabel\s+(sap|sql)|query\s+sql)\b",
    re.I,
)
_DIRECT = re.compile(r"^(halo|hai|hi|selamat|terima kasih|makasih)\b|\b(apa itu|terjemahkan|ringkas(?:an)?)\b", re.I)

# Pertanyaan meta mengenai arsitektur, keamanan, atau konsep agen itu sendiri
_META_CONCEPTUAL = re.compile(
    r"\b((?:(?:apakah\s+)?(?:data|informasi)|(?:data|informasi)\s+apakah).*?(?:dilihat|dikirim|disimpan|aman|rahasia|privasi))|"
    r"(bagaimana\s+cara\s+kerja)|(jelaskan\s+(arsitektur|konsep|mekanisme))\b", re.I
)

def _normalise_target(target_server: str) -> str:
    target = (target_server or "").lower()
    if target.startswith("sql"):
        return "sql"
    if target.startswith("rag"):
        return "rag"
    return "sap"


def _required_sources(message: str, target_server: str) -> list[str]:
    sources: list[str] = []
    for source, pattern in (("sap", _SAP), ("sql", _SQL), ("rag", _RAG)):
        if pattern.search(message) and source not in sources:
            sources.append(source)
    if not sources:
        sources.append(_normalise_target(target_server))
    return sources


def classify_request(
    message: str,
    target_server: str = "all",
    has_attachments: bool = False,
    history: list[dict] | None = None,
) -> RequestIntent:
    text = (message or "").strip()
    # Bila lampiran tersedia, pertanyaan mengacu pada konten lokal kecuali
    # pengguna secara eksplisit meminta validasi ke SAP/SQL/RAG live.
    if has_attachments and not _EXPLICIT_LIVE_SOURCE.search(text):
        return RequestIntent(kind="direct", depth="standard")
    
    # Bila ini pertanyaan konseptual/keamanan tentang sistem, tidak perlu tool live.
    if _META_CONCEPTUAL.search(text):
        return RequestIntent(kind="direct")

    # Definisi, terjemahan, dan peringkasan konten yang sudah diberikan bukan
    # tindakan ke sistem, meskipun kalimatnya diawali kata imperatif "buat".
    if _DIRECT.search(text):
        return RequestIntent(kind="direct")
    if _ACTION.search(text):
        return RequestIntent(kind="action", required_sources=_required_sources(text, target_server), needs_live_data=True)
    if _DEEP.search(text):
        return RequestIntent(kind="deep_analysis", required_sources=_required_sources(text, target_server), depth="deep", needs_live_data=True)
    if _LOOKUP.search(text):
        return RequestIntent(kind="grounded_lookup", required_sources=_required_sources(text, target_server), needs_live_data=True)
    return RequestIntent(kind="direct", confidence=0.8)


def build_investigation_plan(intent: RequestIntent, message: str) -> InvestigationPlan:
    if intent.kind in ("direct", "action"):
        return InvestigationPlan()
    requirements: list[EvidenceRequirement] = []
    for source in intent.required_sources:
        requirements.append(EvidenceRequirement(
            id=f"{source}-primary", source=source,
            purpose=f"Bukti utama yang relevan dari {source.upper()}",
        ))
        if intent.kind == "deep_analysis":
            requirements.append(EvidenceRequirement(
                id=f"{source}-context", source=source,
                purpose=f"Bukti pembanding/konteks untuk memvalidasi analisis {source.upper()}",
            ))
    return InvestigationPlan(requirements=requirements)


def record_tool_evidence(state: AnalysisState, evidence: EvidenceItem) -> None:
    state.evidence.append(evidence)
    if not evidence.success and evidence.error:
        state.tool_errors.append(evidence.error)


def _usable(e: EvidenceItem) -> bool:
    if not e.success or not (e.content or "").strip():
        return False
    if e.row_count == 0 or e.document_count == 0:
        return False
    return True


def evaluate_evidence_sufficiency(state: AnalysisState) -> QualityGateResult:
    if state.intent.kind in ("direct", "action"):
        return QualityGateResult(passed=True)
    covered = {e.server.lower() for e in state.evidence if _usable(e)}
    missing = [s for s in state.intent.required_sources if s.lower() not in covered]
    # Satu bukti relevan per sumber adalah hard gate. Requirement pembanding
    # berfungsi sebagai panduan kedalaman, bukan memaksa query duplikat.
    passed = not missing
    return QualityGateResult(
        passed=passed,
        status="complete" if passed else ("partial" if covered else "blocked"),
        missing_sources=missing,
        missing_requirements=[r.id for r in state.plan.requirements if r.source.lower() in missing],
    )


def build_retry_instruction(state: AnalysisState, result: QualityGateResult) -> str:
    if result.passed or state.intent.kind in ("direct", "action"):
        return ""
    sources = ", ".join(s.upper() for s in result.missing_sources)
    return (
        "SISTEM — EVIDENCE GATE: Jawaban belum boleh difinalkan karena belum ada "
        f"bukti data relevan yang berhasil dari: {sources}. Panggil tool {sources} "
        "yang sesuai dengan pertanyaan pengguna. Jangan menebak angka atau fakta. "
        "Jika sumber gagal atau datanya kosong, laporkan keterbatasan tersebut secara eksplisit."
    )


def get_rag_budget(state: AnalysisState) -> int:
    """Hitung batas panggilan RAG berdasarkan kebutuhan analisis.

    Budget bukan target yang harus dihabiskan. Agent wajib berhenti lebih awal
    bila evidence sudah cukup dan signature dedupe tetap berlaku.
    """
    if "rag" not in {s.lower() for s in state.intent.required_sources}:
        return 0
    if state.intent.kind == "deep_analysis":
        return 4
    if state.intent.kind == "grounded_lookup":
        return 2
    return 0


def build_final_answer_contract(intent: RequestIntent) -> str:
    if intent.kind != "deep_analysis":
        return "Gunakan hanya fakta yang didukung hasil tool dan nyatakan keterbatasan data."
    return (
        "Susun jawaban dengan bagian: Ruang Lingkup & Filter; Temuan Berbasis Data; "
        "Interpretasi; Keterbatasan; Rekomendasi; dan Sumber. Pisahkan fakta dari "
        "interpretasi dan jangan menyebut angka yang tidak terdapat dalam evidence."
    )
