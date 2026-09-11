# Checkpoint — Grounded Deep Analysis Implemented

Tanggal: 2026-09-10
Status: Implementasi source selesai, belum commit/push/deploy.

## Fitur terimplementasi
- Deterministic request classifier: direct, grounded_lookup, deep_analysis, action.
- Investigation plan dan evidence requirements per sumber SAP/SQL/RAG.
- Evidence ledger dan validator domain SAP/SQL/RAG.
- Evidence gate di native tool path dan fallback text-tool path.
- Maksimal dua retry evidence; fallback partial/blocked yang jujur.
- Adaptive RAG call budget berdasarkan intent dan konfigurasi mode.
- Domain-aware strategy guidance untuk SAP, SQL, RAG, dan multi-source.
- Deterministic final-answer quality review dengan pemeriksaan struktur dan angka unsupported.
- Mode config fields via migration 0023: analysis_depth, require_evidence, max_review_cycles, rag_call_budget.
- Admin mode API menerima field konfigurasi baru.
- AdminChatModes Add form menampilkan Analysis Quality controls; evidence safety wajib dan tidak dapat dimatikan.

## File utama
- backend/analysis_policy.py
- backend/evidence_validators.py
- backend/analysis_strategies.py
- backend/answer_quality.py
- backend/agent.py
- backend/database.py
- backend/main.py
- backend/migrations.py
- frontend/src/components/AdminChatModes.jsx

## Test baru
- tests/test_analysis_policy.py
- tests/test_investigation_plan.py
- tests/test_evidence_validators.py
- tests/test_rag_evidence_budget.py
- tests/test_analysis_strategies.py
- tests/test_answer_quality.py

## Hasil verifikasi aktual
- `backend/venv/bin/pytest tests/ -q`: PASS, 100%, 0 failures.
- `frontend/npm run build`: PASS, Vite/PWA build selesai; hanya peringatan chunk size existing.
- `git diff --check`: PASS.

## Catatan status Git
Perubahan belum commit, belum push, dan belum deploy production. `.hermes/` untracked berisi plan/checkpoint proyek.
