# Aturan Proyek SAP AI Assistant (Workspace Rules)

Aturan ini wajib dipatuhi oleh semua asisten AI (Antigravity/Gemini/Agents) dalam pengembangan proyek ini:

## 1. Aturan Ketat Deployment & Lingkungan Kerja
- **DILARANG AUTO DEPLOY KE PRODUCTION**: Jangan pernah melakukan auto deploy ke lingkungan production atau menyentuh direktori `/var/www/` kecuali ada instruksi/permintaan eksplisit dari pengguna.
- **ISOLASI DIREKTORI KERJA**: Seluruh pekerjaan pengembangan, modifikasi kode, dan pengujian HANYA boleh dilakukan di dalam workspace:
  `/home/abap/Projects/SAP-AI-Assistant/`
  Jangan pernah menjalankan perintah yang mengakses atau memodifikasi `/var/www/SAP-AI-Assistant/`.
- **DILARANG PUSH TANPA REVIEW & PERSETUJUAN EKSPLISIT**: Jangan pernah melakukan `git push` ke remote repository (termasuk branch `main`) secara sepihak. Berikan rincian perubahan (diff) kepada pengguna terlebih dahulu untuk direview, dan tunggu konfirmasi/persetujuan eksplisit sebelum push.

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
