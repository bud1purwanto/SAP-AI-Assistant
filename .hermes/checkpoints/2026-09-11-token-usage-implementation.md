# Checkpoint — Implementasi Akurasi Token Usage

Tanggal: 2026-09-11
Workspace: `/home/abap/Projects/SAP-AI-Assistant`

## Status
Selesai dan terverifikasi lokal. Tidak deploy, tidak menyentuh `/var/www`, tidak commit, dan tidak push.

## Implementasi
- `backend/agent.py`
  - Mengakumulasi token untuk setiap model-call dalam satu request.
  - Mencakup iterasi, retry evidence, quality revision, dan fallback yang melewati `call_model`.
  - Jika satu call tidak mengirim metadata usage, call tersebut diestimasi dan seluruh request diberi `estimated=true`.
  - Mencatat jumlah model-call dan nama model aktual dari response metadata bila tersedia.
  - Mencatat cached input token dari detail cache provider.
- `backend/models.py`
  - Menambahkan `model_calls` pada `UsageStats`.
- `backend/migrations.py`
  - Migrasi non-destruktif `0024_chat_message_usage`: menambah kolom `usage TEXT` memakai `ADD COLUMN IF NOT EXISTS`.
- `backend/database.py`
  - Menyimpan dan mengambil JSON usage bersama pesan AI.
- `backend/main.py`
  - Meneruskan flag estimated ke agregasi user.
  - Menyimpan snapshot usage setelah kalkulasi final selesai.
- `backend/scheduler.py`
  - Scheduled chat sekarang menyimpan usage per pesan dan masuk agregasi token user.
- `frontend/src/components/ChatLayout.jsx`
  - Memulihkan usage dari JSON saat sesi dimuat ulang.
- `frontend/src/components/UsagePill.jsx`
  - Menampilkan `~` untuk angka yang mengandung estimasi, status sebagian diperkirakan, dan jumlah model-call.
- `frontend/src/lib/i18n.js`
  - Menambahkan label EN/ID untuk model-call dan estimated.

## Regression tests
- Provider tanpa metadata tetap menghasilkan estimasi.
- Partial metadata pada multi-call mengakumulasi exact + estimate dan ditandai estimated.
- Multiple exact calls dijumlahkan.
- Usage pesan tersimpan dan dapat dimuat ulang dari database/API.

## Verifikasi aktual terakhir
- `backend/venv/bin/pytest tests/ -q`
  - Exit code: 0
  - Progress akhir: 100%, seluruh test lulus.
- `cd frontend && npm run build`
  - Exit code: 0
  - Vite build sukses; PWA precache 177 entries; hanya warning chunk >500 kB.
- `git diff --check`
  - Exit code: 0

## Catatan akurasi
Angka exact tetap bergantung pada metadata provider. Jika metadata tidak tersedia pada salah satu model-call, sistem tidak lagi diam-diam menganggap total parsial sebagai exact: model-call tersebut diestimasi dan UI menandainya dengan `~` / `estimated`.
