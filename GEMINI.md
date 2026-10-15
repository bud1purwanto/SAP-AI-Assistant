# Aturan Proyek SAP AI Assistant (Workspace Rules)

Aturan ini wajib dipatuhi oleh semua asisten AI (Antigravity/Gemini/Agents) dalam pengembangan proyek ini:

## 1. Aturan Ketat Deployment & Lingkungan Kerja (STRICT)
- **DILARANG MENYENTUH / PUSH KE CONTAINER DOCKER (PRODUCTION)**:
  - Container Docker (`enterprise-ai-backend`, `enterprise-ai-frontend`, dsb.) adalah lingkungan **PRODUCTION**.
  - Dilarang keras menjalankan `docker cp`, `docker restart`, `docker exec`, `docker stop`, `docker compose`, atau memodifikasi/menyalin berkas apapun ke dalam container Docker tanpa instruksi/perintah eksplisit dari pengguna.
- **DILARANG AUTO DEPLOY KE PRODUCTION & DILARANG MENYENTUH `/var/www/`**:
  - Jangan pernah melakukan auto deploy ke lingkungan production atau menyentuh direktori `/var/www/` (`/var/www/Enterprise-AI-Assistant/` atau `/var/www/SAP-AI-Assistant/`).
- **DILARANG KERAS COMMIT & PUSH KE GIT TANPA PERINTAH (AUTO DEPLOY KE PRD)**:
  - Melakukan `git push` ke repository akan secara otomatis memicu **AUTO DEPLOY KE PRODUCTION (PRD)**.
  - Jangan pernah mengeksekusi `git commit` maupun `git push` secara otomatis atau sepihak. Biarkan seluruh perubahan tetap berada di *working tree* lokal untuk direview oleh pengguna. Tunggu perintah/konfirmasi tertulis eksplisit dari pengguna sebelum melakukan push.
- **ISOLASI DIREKTORI KERJA**: Seluruh pekerjaan pengembangan, modifikasi kode, dan pengujian HANYA boleh dilakukan di dalam workspace lokal:
  `/data/Projects/Enterprise AI Assistant/`

## 2. Keamanan Database & Integritas Data (STRICT / SANGAT KETAT)
- **DILARANG DROP DATABASE ATAU SKEMA**: Jangan pernah menjalankan perintah `DROP DATABASE`, `DROP SCHEMA`, atau menghapus objek struktur database lainnya tanpa instruksi/permintaan tertulis yang eksplisit dari pengguna.
- **DILARANG MENGHAPUS DATA (DELETE / TRUNCATE)**: Jangan pernah mengeksekusi operasi penghapusan data massal maupun parsial (`DELETE FROM ...`, `TRUNCATE TABLE ...`, pembersihan file basis data, atau reset data aplikasi) kecuali atas permintaan eksplisit dari pengguna.
- **PERUBAHAN STRUKTUR AMAN**: Seluruh penyesuaian skema / tabel database harus bersifat non-destruktif dan menjaga keutuhan data yang sudah ada.

## 3. Aturan Pengujian & Eksekusi
- Pengguna melakukan pengujian secara lokal (`localhost`).
- Sebelum meminta konfirmasi push, pastikan build lokal dan pengujian berjalan sukses:
  - Frontend: `cd frontend && npm run build`
  - Backend: `backend/venv/bin/pytest tests/`
- Seluruh berkas skrip shell (`.sh`) dan teks wajib menggunakan format Unix LF line endings (bukan Windows CRLF).

## 4. Integritas Copywriting & Desain
- Jangan pernah mengubah kata, istilah, atau copywriting yang sudah ada (misalnya kata *Enterprise*, nama modul, dsb.) kecuali diminta langsung oleh pengguna.
- Fokus modifikasi adalah pada perbaikan fungsional, arsitektur, dan kerapian tampilan antarmuka (UI/UX).

## 5. Standar Wajib Multibahasa (Multilanguage / i18n)
- Setiap fitur baru, komponen UI, notifikasi, dan artefak WAJIB mendukung Multibahasa (minimal Bahasa Indonesia `id` dan English `en`).
- Dilarang keras meng-hardcode teks antarmuka secara statis; wajib menggunakan hook `useLanguage()` dan mendaftarkan kunci ke kamus `frontend/src/lib/i18n.js`.

## 6. Desain Antarmuka Dinamis & Responsif (Mobile & Desktop)
- Seluruh tampilan komponen, form, modal, tabel, dan diagram WAJIB responsif dan dinamis, menyesuaikan layar HP (Mobile) maupun Desktop secara rapi.
- Gunakan prinsip mobile-first / responsive breakpoints Tailwind CSS (`sm:`, `md:`, `lg:`) serta hindari overflow horizontal atau elemen terpotong pada layar kecil.

