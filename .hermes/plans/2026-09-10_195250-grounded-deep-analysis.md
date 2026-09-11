# Grounded Deep Analysis Implementation Plan

> **For Hermes:** Implementasikan rencana ini bertahap dengan TDD, review kepatuhan spesifikasi, lalu review kualitas kode.

**Goal:** Meningkatkan akurasi dan kedalaman jawaban detail—terutama analisis berbasis SAP, SQL, dan RAG—dengan memaksa pengumpulan bukti, validasi kecukupan data, serta pemeriksaan klaim sebelum jawaban final, tanpa memperlambat pertanyaan sederhana secara tidak perlu.

**Architecture:** Tambahkan lapisan orkestrasi `analysis_policy` di atas agent loop yang sudah ada. Lapisan ini mengklasifikasikan kebutuhan kedalaman dan sumber bukti secara deterministik + LLM terstruktur bila ambigu, membentuk rencana investigasi internal, melacak evidence dari setiap tool, dan menahan jawaban final sampai quality gate terpenuhi. Kualitas tidak ditentukan oleh lama proses atau jumlah iterasi, tetapi oleh cakupan pertanyaan, bukti sukses, keterlacakan klaim, dan keterbukaan atas keterbatasan.

**Tech Stack:** Python 3.13, FastAPI, LangChain `ChatOpenAI`, MCP tools, Pydantic, pytest; React/Vite untuk indikator progres dan metadata jawaban.

---

## 1. Target perilaku dan acceptance criteria

### 1.1 Kelas permintaan

Orchestrator membedakan permintaan menjadi empat kelas:

1. `direct` — sapaan, terjemahan, definisi sederhana, penulisan umum; boleh dijawab langsung.
2. `grounded_lookup` — meminta fakta tertentu dari SAP/SQL/RAG; wajib minimal satu bukti relevan dari sumber target.
3. `deep_analysis` — meminta analisis, perbandingan, tren, penyebab, anomali, rekonsiliasi, rekomendasi, atau jawaban detail; wajib rencana, beberapa langkah bukti sesuai kebutuhan, evaluasi kecukupan, dan quality review.
4. `action` — meminta mutasi/pengiriman; tetap mengikuti action-card dan access control yang sudah ada, dengan pemeriksaan fakta sebelum draft/eksekusi.

### 1.2 Prinsip lintas sumber

- SAP, SQL, dan RAG memiliki aturan evidence yang seragam tetapi validator domain berbeda.
- Tool call sukses secara teknis belum otomatis menjadi bukti yang relevan.
- Tidak boleh menyebut angka/fakta spesifik sebagai hasil live bila tidak ada dalam evidence.
- Data kosong, error, terpotong, atau filter ambigu wajib dinyatakan sebagai keterbatasan.
- Pertanyaan sederhana tidak dipaksa melewati pipeline deep analysis.
- `max_iterations` tetap batas keselamatan, bukan indikator kualitas.

### 1.3 Acceptance criteria

- Permintaan analisis SAP/SQL/RAG tidak bisa selesai pada iterasi pertama tanpa evidence yang memenuhi policy.
- Jawaban akhir memisahkan `Temuan Berbasis Data`, `Interpretasi`, `Keterbatasan`, dan `Rekomendasi` ketika kelasnya `deep_analysis`.
- Setiap angka utama dapat ditelusuri ke evidence/tool call internal.
- Jika evidence tidak cukup, jawaban secara eksplisit mengatakan belum cukup dan tidak mengarang kesimpulan.
- Pertanyaan umum tetap cepat dan tidak memanggil tool tanpa kebutuhan.
- Access control dan read-only/write guard yang ada tetap berlaku.

---

## 2. Desain komponen

### 2.1 `backend/analysis_policy.py` — baru

Definisikan model terstruktur:

- `RequestIntent`: `kind`, `depth`, `required_sources`, `needs_live_data`, `requested_dimensions`, `time_range`, `entities`, `confidence`.
- `InvestigationPlan`: daftar `EvidenceRequirement` dengan tujuan, sumber, jenis bukti, status, dan alasan.
- `EvidenceItem`: server, tool, signature, args aman, success/error, row/document count, truncation, payload digest, source identifiers, dan content untuk sintesis.
- `QualityGateResult`: `pass/fail`, kekurangan bukti, unsupported claims, retry guidance, dan status `complete|partial|blocked`.
- `AnalysisState`: intent, plan, evidence ledger, tool errors, iteration count, review count.

Fungsi inti:

- `classify_request(...)`
- `build_investigation_plan(...)`
- `record_tool_evidence(...)`
- `evaluate_evidence_sufficiency(...)`
- `build_retry_instruction(...)`
- `build_final_answer_contract(...)`

Klasifikasi menggunakan aturan deterministik lebih dahulu (kata kerja analisis, sumber terpilih, permintaan data live, rentang waktu, agregasi/perbandingan). LLM classifier terstruktur hanya dipakai bila confidence rendah agar biaya dan latensi terkendali.

### 2.2 `backend/evidence_validators.py` — baru

Validator per domain:

- SAP: deteksi error RFC, tabel/field tidak valid, nol baris, truncation, jumlah record, target server, dan konsistensi filter.
- SQL: hanya menerima hasil `SELECT`/metadata read-only untuk analisis, mendeteksi error, row count, truncation, query scope, dan aggregate result.
- RAG: status ditemukan, document/page/source identifiers, skor/relevansi jika tersedia, kutipan, serta konflik antardokumen.

Semua validator menghasilkan `EvidenceItem` dalam bentuk yang konsisten. Payload mentah tetap tersedia hanya selama request; log permanen menyimpan metadata/digest, bukan data sensitif penuh.

### 2.3 `backend/answer_quality.py` — baru

Quality reviewer memeriksa draft terhadap evidence ledger:

- apakah seluruh bagian pertanyaan terjawab;
- apakah angka/nama/tanggal utama didukung;
- apakah fakta dan interpretasi dipisahkan;
- apakah terdapat kontradiksi evidence;
- apakah keterbatasan disebutkan;
- apakah rekomendasi sesuai data dan bukan kepastian palsu.

Reviewer mengembalikan JSON terstruktur, bukan prose. Maksimal satu siklus revisi draft agar tidak terjadi loop tanpa batas.

---

## 3. Perubahan agent loop

### Task 1: Baseline observability sebelum mengubah perilaku

**Objective:** Menangkap kualitas pipeline saat ini agar peningkatan dapat diukur.

**Files:**
- Modify: `backend/agent.py:766-982, 1671-2101`
- Modify: `backend/models.py` pada model usage/response terkait
- Test: `tests/test_analysis_observability.py`

**Langkah:**

1. Tulis test gagal untuk metadata: intent class, iteration count, successful/failed tool calls, evidence count, completion status, dan latency.
2. Tambahkan object telemetry internal per request.
3. Jangan mengekspos chain-of-thought; hanya tahapan dan metrik operasional.
4. Jalankan test terarah dan suite backend.

### Task 2: Implementasi classifier dan policy

**Objective:** Menentukan kapan jawaban langsung diperbolehkan dan kapan grounding/deep analysis wajib.

**Files:**
- Create: `backend/analysis_policy.py`
- Test: `tests/test_analysis_policy.py`

**Kasus test minimum:**

- “Apa itu MRP?” → `direct`, sumber tidak wajib.
- “Berapa stok material X di SAP?” → `grounded_lookup`, SAP wajib.
- “Analisa tren order terlambat tiga bulan dan penyebabnya” → `deep_analysis`, SAP wajib, membutuhkan data waktu dan pembanding.
- “Bandingkan nilai invoice SAP dengan tabel SQL” → `deep_analysis`, SAP + SQL wajib.
- “Analisa SOP approval dari dokumen internal” → `deep_analysis`, RAG wajib.
- “Buat ringkasan teks berikut” → `direct` bila seluruh data sudah ada di prompt/lampiran.
- Follow-up “kenapa begitu?” mempertimbangkan history dan evidence sebelumnya.

### Task 3: Rencana investigasi internal

**Objective:** Mencegah tool call oportunistik tanpa cakupan yang jelas.

**Files:**
- Modify: `backend/analysis_policy.py`
- Modify: `backend/agent.py` setelah resolusi mode dan sebelum agentic loop
- Test: `tests/test_investigation_plan.py`

**Perilaku:**

- Untuk `grounded_lookup`, buat 1–2 evidence requirements.
- Untuk `deep_analysis`, pecah pertanyaan menjadi dimensi: populasi, periode, metrik, pembanding, dan kandidat penyebab.
- Plan bersifat internal dan ringkas; tidak menampilkan reasoning rahasia.
- Jika parameter kritis tidak ada, gunakan filter aman yang dapat diinferensikan; bila benar-benar mustahil, jawaban harus menyebut parameter yang belum tersedia, bukan menebak.

### Task 4: Evidence ledger dan validator SAP/SQL/RAG

**Objective:** Menilai hasil tool berdasarkan substansi, bukan hanya `is_error=False`.

**Files:**
- Create: `backend/evidence_validators.py`
- Modify: `backend/agent.py:1789-1808, 2031-2065`
- Test: `tests/test_evidence_validators.py`

**Perilaku:**

- Seluruh jalur native tool call dan fallback text-tool parser harus masuk ke fungsi pencatatan yang sama.
- Catat success, relevance, row/source count, truncation, target, dan error category.
- Jangan menganggap hasil kosong sebagai evidence lengkap.
- Hilangkan duplikasi logic pencatatan `sources` antara dua jalur tool.

### Task 5: Evidence gate sebelum menerima jawaban final

**Objective:** Menutup celah `response.tool_calls == []` yang saat ini langsung mengakhiri loop.

**Files:**
- Modify: `backend/agent.py:1747-1842`
- Test: `tests/test_agent_evidence_gate.py`

**Aturan:**

- `direct`: jawaban teks dapat diterima segera.
- `grounded_lookup`: jawaban hanya diterima jika semua required source minimal memiliki evidence relevan yang sukses.
- `deep_analysis`: jawaban hanya diterima bila evidence requirements utama terpenuhi atau status dinyatakan `partial/blocked` dengan keterbatasan eksplisit.
- Bila belum cukup, buang/reset draft stream dan masukkan instruksi retry spesifik berdasarkan kekurangan, misalnya “belum ada data periode pembanding” alih-alih “cari lagi”.
- Maksimum retry evidence gate: dua kali; setelah itu synthesize partial result secara jujur.

### Task 6: Hilangkan batas RAG yang terlalu kaku

**Objective:** Mengganti batas global dua panggilan RAG dengan budget berbasis kebutuhan dan duplikasi.

**Files:**
- Modify: `backend/agent.py:1675, 1771-1779, 1938-1955, 2047-2054`
- Modify: konfigurasi mode/migrasi jika diperlukan
- Test: `tests/test_rag_evidence_budget.py`

**Desain:**

- `direct`: 0 panggilan.
- `grounded_lookup`: default 1–2.
- `deep_analysis`: default maksimum 4, tetapi berhenti segera bila coverage terpenuhi.
- Tetap cegah signature duplikat.
- `rag_answer found` tidak otomatis dianggap cukup bila pertanyaan meminta perbandingan beberapa dokumen atau periode.

### Task 7: Domain-aware query strategy

**Objective:** Meningkatkan kualitas langkah investigasi tanpa hardcode semua kasus bisnis.

**Files:**
- Create: `backend/analysis_strategies.py`
- Modify: `backend/agent.py` saat membentuk prompt dinamis
- Test: `tests/test_analysis_strategies.py`

**Strategi:**

- SAP: metadata/struktur dahulu bila field tidak pasti; gunakan filter/paging; pisahkan header, item, status, dan transaksi pendukung; hindari full-table scan.
- SQL: metadata bila skema ambigu; query agregat dahulu; drill-down hanya untuk anomali; wajib read-only.
- RAG: pencarian kandidat → jawab/konteks halaman relevan → deteksi konflik/keterbatasan sumber.
- Multi-source: normalisasi key, periode, unit, timezone, dan grain sebelum perbandingan.

### Task 8: Draft synthesis dan quality review

**Objective:** Memastikan jawaban detail lengkap, terstruktur, dan tidak melebihi bukti.

**Files:**
- Create: `backend/answer_quality.py`
- Modify: `backend/agent.py` sebelum `extract_and_build`
- Test: `tests/test_answer_quality.py`

**Kontrak jawaban `deep_analysis`:**

1. Ruang lingkup dan filter yang benar-benar digunakan.
2. Temuan utama berbasis data.
3. Analisis/interpretasi dengan tingkat keyakinan.
4. Anomali atau konflik data.
5. Keterbatasan data.
6. Rekomendasi atau tindak lanjut.
7. Sumber sistem/dokumen yang dipakai.

Reviewer tidak boleh meminta tool baru; bila menemukan kekurangan fatal dan budget masih ada, kembalikan ke evidence gate. Selain itu revisi draft satu kali.

### Task 9: Mode kualitas dan konfigurasi admin

**Objective:** Membuat trade-off latency/akurasi transparan tanpa mengganti prinsip anti-halusinasi.

**Files:**
- Modify: `backend/migrations.py:199-242`
- Modify: `backend/database.py` fungsi chat mode
- Modify: `backend/main.py:1704-1915`
- Modify: `frontend/src/components/AdminChatModes.jsx`
- Modify: `frontend/src/lib/i18n.js`
- Test: backend mode tests; frontend build

**Field mode yang diusulkan:**

- `analysis_depth`: `auto|standard|deep`
- `max_tool_calls`
- `max_review_cycles` (0–1)
- `require_evidence_for_live_claims` default `true`
- `rag_call_budget`
- `minimum_source_coverage`

Mode Fast tetap tidak boleh mengarang data live; ia hanya memakai plan lebih pendek dan tanpa reviewer untuk permintaan non-detail. Mode Medium/Expert meningkatkan coverage dan review.

### Task 10: UI progres dan transparansi evidence

**Objective:** Menjelaskan mengapa analisis lebih lama dan memberi pengguna dasar kepercayaan.

**Files:**
- Modify: `frontend/src/components/ChatLayout.jsx`
- Modify: `frontend/src/components/ChatMessage.jsx`
- Modify: `frontend/src/lib/i18n.js`
- Test: frontend component tests bila tersedia; Playwright smoke; build

**Tahapan progres:**

- Memahami ruang lingkup
- Menyusun kebutuhan data
- Mengambil data SAP/SQL/dokumen
- Memeriksa kecukupan
- Memvalidasi temuan
- Menyusun jawaban

Tampilkan ringkasan bukti yang aman: nama sistem/dokumen, filter/periode, jumlah baris/sumber, dan status lengkap/parsial. Jangan tampilkan chain-of-thought, kredensial, query sensitif, atau payload mentah besar.

---

## 4. Evaluasi kualitas

### Dataset evaluasi

Buat `tests/evals/grounded_analysis_cases.json` dengan setidaknya:

- 10 direct/general prompts;
- 10 SAP lookups;
- 15 SAP deep analyses;
- 10 SQL lookups/analyses;
- 10 RAG lookups/analyses;
- 5 multi-source reconciliation cases;
- kasus data kosong, tool error, field invalid, hasil terpotong, konflik dokumen, dan prompt injection dalam hasil tool.

Gunakan tool fixture deterministik agar CI tidak bergantung pada SAP/SQL/RAG live.

### Metrik

- `grounding_rate`: klaim live dengan evidence / seluruh klaim live.
- `source_coverage`: required sources terpenuhi.
- `unsupported_claim_rate`: target 0 untuk angka/fakta kritis.
- `question_coverage`: bagian pertanyaan yang dijawab.
- `honest_partial_rate`: kegagalan data dinyatakan jujur.
- `tool_efficiency`: tool call relevan / seluruh tool call.
- latency p50/p95 per kelas intent.
- regression pada direct requests agar tidak menjadi lambat.

### Quality gates CI

- Seluruh unit/integration tests lulus.
- Unsupported critical claims = 0 pada fixture deterministik.
- Direct-request p95 tidak bertambah signifikan pada benchmark lokal.
- Tidak ada mutasi SAP/SQL selama test analisis read-only.

---

## 5. Observability dan audit

Tambahkan structured log per request:

- request/session ID;
- intent/depth dan confidence;
- mode/model/provider aktual;
- plan requirement IDs;
- tool call metadata dan duration;
- evidence coverage;
- alasan quality gate retry/fail;
- final status `complete|partial|blocked`;
- token dan latency.

Jangan mencatat password, token, kredensial SAP, isi email sensitif, atau payload data penuh. Gunakan redaction dan hash/digest untuk korelasi.

---

## 6. Risiko dan mitigasi

1. **Latensi dan biaya meningkat** — hanya aktifkan deep pipeline untuk intent yang membutuhkan; gunakan classifier deterministik dan stop saat coverage cukup.
2. **Loop tool berulang** — pertahankan signature dedupe, budget per sumber, dan retry maksimal.
3. **Context overflow akibat hasil besar** — ringkas hasil tool secara deterministik, paging/agregasi, simpan evidence ledger terstruktur.
4. **False-positive klasifikasi detail** — sediakan `auto|standard|deep`; classifier confidence rendah dapat memakai structured LLM check.
5. **Prompt injection dari SAP/SQL/RAG** — tandai hasil tool sebagai data tidak tepercaya; instruksi di dalam hasil tidak boleh mengubah policy.
6. **Reviewer ikut berhalusinasi** — reviewer hanya menerima draft + evidence ledger dan wajib output JSON dengan referensi evidence IDs.
7. **Jawaban parsial terasa mengecewakan** — tampilkan secara jelas data apa yang berhasil, apa yang belum tersedia, dan jangan menutupinya dengan narasi umum.
8. **Batas RAG lama menghambat detail** — ganti batas dua call dengan budget adaptif, bukan menghapus pembatasan seluruhnya.

---

## 7. Urutan rollout aman

### Fase A — Fondasi

Tasks 1–5: telemetry, classifier, plan, ledger, evidence gate. Feature flag `grounded_analysis_enabled=false` secara default sampai evaluasi lolos.

### Fase B — Kedalaman

Tasks 6–8: budget adaptif, strategi domain, reviewer.

### Fase C — Produk

Tasks 9–10: konfigurasi mode, UI progres/evidence.

### Fase D — Canary

Aktifkan untuk mode Expert dahulu, bandingkan baseline versus pipeline baru dari fixture dan penggunaan terbatas. Setelah stabil, aktifkan `auto` untuk Medium/default. Fast tetap memakai evidence gate untuk klaim live, tetapi tanpa review mendalam untuk pertanyaan sederhana.

Rollback cukup dengan mematikan feature flag; tidak ada perubahan destruktif pada data.

---

## 8. Verifikasi akhir

Jalankan secara lokal di workspace:

- `backend/venv/bin/pytest tests/test_analysis_policy.py tests/test_investigation_plan.py tests/test_evidence_validators.py tests/test_agent_evidence_gate.py tests/test_rag_evidence_budget.py tests/test_analysis_strategies.py tests/test_answer_quality.py -v`
- `backend/venv/bin/pytest tests/`
- `cd frontend && npm run build`
- Playwright smoke untuk progres dan panel sumber.
- Jalankan eval fixture dan bandingkan baseline vs implementasi pada grounding, coverage, tool efficiency, latency, dan unsupported claims.

Tidak melakukan deploy production atau push sebelum diff, hasil test, dan hasil evaluasi direview serta disetujui Baginda.

---

## 9. Files likely to change

- Create: `backend/analysis_policy.py`
- Create: `backend/evidence_validators.py`
- Create: `backend/analysis_strategies.py`
- Create: `backend/answer_quality.py`
- Modify: `backend/agent.py`
- Modify: `backend/models.py`
- Modify: `backend/config.py`
- Modify: `backend/migrations.py`
- Modify: `backend/database.py`
- Modify: `backend/main.py`
- Modify: `frontend/src/components/AdminChatModes.jsx`
- Modify: `frontend/src/components/ChatLayout.jsx`
- Modify: `frontend/src/components/ChatMessage.jsx`
- Modify: `frontend/src/lib/i18n.js`
- Create: `tests/test_analysis_policy.py`
- Create: `tests/test_investigation_plan.py`
- Create: `tests/test_evidence_validators.py`
- Create: `tests/test_agent_evidence_gate.py`
- Create: `tests/test_rag_evidence_budget.py`
- Create: `tests/test_analysis_strategies.py`
- Create: `tests/test_answer_quality.py`
- Create: `tests/test_analysis_observability.py`
- Create: `tests/evals/grounded_analysis_cases.json`

## 10. Keputusan desain yang direkomendasikan

- Gunakan pipeline adaptif otomatis sebagai default, bukan memaksa semua pertanyaan menjadi lambat.
- Evidence gate wajib untuk semua klaim live SAP/SQL/RAG, termasuk mode Fast.
- Deep analysis wajib untuk permintaan eksplisit “analisa”, “detail”, “bandingkan”, “tren”, “akar masalah”, “anomali”, “rekonsiliasi”, atau multi-sumber.
- Maksimal satu quality-review cycle.
- Tampilkan status `partial` daripada membuat kesimpulan tanpa dasar.
- Terapkan feature flag dan rollout bertahap agar perubahan mudah dibalik.