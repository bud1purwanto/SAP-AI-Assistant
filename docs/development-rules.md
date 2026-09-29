# Aturan Pengembangan SAP AI Assistant

> Dokumen kerja harian. Jika ada konflik, `AGENTS.md` dan instruksi eksplisit pengguna memiliki prioritas lebih tinggi.

## 1. Guardrail Wajib

1. Semua development, edit, dan test hanya dilakukan di `/data/Projects/Enterprise AI Assistant/`.
2. Jangan mengakses atau memodifikasi `/var/www/Enterprise-AI-Assistant/` atau `/var/www/SAP-AI-Assistant/` tanpa instruksi eksplisit.
3. Jangan auto-deploy ke production.
4. Dilarang melakukan `git commit` maupun `git push` secara otomatis. Semua perubahan harus tetap di working tree untuk direview pengguna sampai ada instruksi eksplisit.
5. Jangan menjalankan `DROP DATABASE`, `DROP SCHEMA`, `DROP` object, `TRUNCATE`, atau `DELETE` data tanpa permintaan tertulis yang eksplisit.
6. Perubahan database harus non-destruktif dan menjaga data lama.
7. Jangan mengubah copy/istilah existing kecuali diminta.
8. Semua UI/notification/artifact baru wajib mendukung minimal `id` dan `en`.
9. Semua UI baru wajib responsif pada mobile dan desktop.
10. Berkas `.sh` dan teks memakai Unix LF.

## 2. Alur Kerja Perubahan

1. Baca `AGENTS.md`, file domain, test, dan dokumentasi terkait.
2. Periksa `git status`; perubahan yang sudah ada dianggap milik pengguna.
3. Tetapkan scope kecil dan invariant yang tidak boleh rusak.
4. Implementasikan pada boundary yang tepat; hindari duplikasi business rule.
5. Tambahkan/ubah test untuk success, failure, auth, dan isolation path yang relevan.
6. Jalankan test terfokus, lalu lint/build/test suite sesuai risiko.
7. Review `git diff` untuk secret, copy tidak sengaja, destructive SQL, dan perubahan di luar scope.
8. Perbarui dokumen mapping bila fitur, schema, arsitektur, atau design token berubah.
9. Laporkan file yang berubah, hasil verifikasi, dan risiko tersisa.
10. Push/deploy hanya setelah persetujuan eksplisit.

## 3. Backend

- Handler HTTP berada di `backend/main.py`; logic AI di `agent.py`; persistence di `database.py`.
- Gunakan Pydantic model untuk kontrak request/response yang reusable.
- Endpoint sensitif wajib memakai `get_current_user` atau `require_superadmin`.
- Superadmin action harus diverifikasi terhadap state database terbaru.
- Jangan percaya `role`, `username`, owner, quota, atau permission dari payload browser.
- Query SQL memakai bind parameter. Dynamic identifier harus berasal dari allowlist.
- Semua akses data milik pengguna difilter menggunakan owner pada query.
- Error ke client harus informatif tetapi tidak membocorkan secret, stack, query internal, atau credential.
- Integrasi eksternal mempunyai timeout, error mapping, dan fallback yang eksplisit.
- Kontrak event streaming harus backward-compatible.
- Background loop menangani cancellation dan exception tanpa mematikan lifespan.

## 4. Database dan Migration

- PostgreSQL adalah requirement wajib; jangan menambah fallback SQLite.
- Schema baru menggunakan `ai_assistant` dan timestamp baru memakai `TIMESTAMPTZ`.
- Tambahkan perubahan sekali-jalan ke `backend/migrations.py` dan migration ledger.
- Gunakan `CREATE ... IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` bila sesuai.
- Jangan membungkus DDL PostgreSQL yang gagal lalu melanjutkan transaksi seolah aman.
- Backfill harus idempoten atau dijamin hanya sekali oleh ledger.
- Tambahkan index berdasarkan pola query nyata, bukan asumsi.
- Test instalasi kosong dan upgrade dari state lama bila schema berubah.
- Jangan memasukkan database lokal, dump, secret, atau data pengguna ke commit.

## 5. Frontend

- Functional component dan hooks adalah pola default; `ErrorBoundary` class adalah pengecualian yang sah.
- Gunakan `frontend/src/lib/api.js` untuk konsistensi request/auth/error.
- Jangan menduplikasi server-side authorization di UI sebagai sumber kebenaran.
- Gunakan token semantic dari `index.css`, bukan warna literal baru.
- Gunakan breakpoint mobile-first dan container overflow lokal untuk tabel/code/diagram.
- Hormati dynamic viewport dan safe-area; uji keyboard virtual.
- Setiap async action memiliki loading, disabled, error, dan retry/close state yang masuk akal.
- Hindari menambah tanggung jawab ke `ChatLayout.jsx`; ekstrak komponen/hook untuk domain baru.
- Pertahankan kompatibilitas PWA/service worker ketika mengubah asset atau routing.

## 6. i18n

Untuk setiap teks UI baru:

1. Buat key namespaced di `frontend/src/lib/i18n.js`.
2. Isi value `en` dan `id` dengan makna setara.
3. Ambil melalui `const { t, language } = useLanguage()`.
4. Gunakan parameter (`{count}`, `{name}`) alih-alih concatenation.
5. Format tanggal/angka menggunakan locale aktif.
6. Uji kedua bahasa, termasuk label panjang dan empty/error state.

Lihat juga `docs/MULTILANGUAGE_GUIDELINES.md`. Perhatikan implementasi aktual: hook berada di `frontend/src/hooks/useLanguage.jsx` dan default language di `frontend/src/lib/i18n.js` saat ini adalah `en`; kode aktual menjadi sumber kebenaran bila dokumentasi lama berbeda.

## 7. Keamanan

- Jangan log/commit API key, JWT secret, SAP password, bearer token, cookie, atau isi credential terenkripsi/dekripsi.
- Password baru di-hash dengan bcrypt; jangan menulis plaintext password ke database.
- Lakukan masking secret sebelum response konfigurasi.
- Validate file berdasarkan ukuran, ekstensi/content type, jumlah, dan ownership.
- Nama file harus disanitasi; download harus memakai owner check dan content disposition aman.
- Tool MCP yang dapat menulis data/program memerlukan permission dan confirmation flow yang tepat.
- CORS production memakai origin spesifik; wildcard tidak boleh digabung dengan credentials.
- Perubahan role/access/session penting masuk audit log.

## 8. Testing

### Perintah minimum sebelum handoff

```bash
cd frontend && npm run lint
cd frontend && npm run build
backend/venv/bin/pytest tests/
```

Jalankan dari root repository sebagai command terpisah bila shell state tidak dipertahankan. Bila virtual environment belum tersedia, laporkan dengan jelas; jangan mengganti environment pengguna tanpa izin.

### Test tambahan berdasarkan perubahan

| Area | Verifikasi |
|---|---|
| Backend domain | `pytest` pada file test terkait, lalu suite penuh |
| Frontend logic | test di `frontend/tests/` |
| Flow UI | Playwright spec terkait melalui `scripts/e2e.sh`/`npm run test:e2e` |
| Database | migration, fresh install, upgrade path, isolation |
| Auth/RBAC | unauthenticated, forbidden, allowed, stale token/role |
| Streaming | urutan event, cancel, reconnect, final persistence |
| Responsive | portrait mobile, compact landscape, desktop |
| i18n | `id` dan `en`, termasuk interpolasi |

## 9. Git dan Review

- Jangan menghapus atau me-reset perubahan pengguna yang tidak terkait.
- Commit harus fokus pada satu tujuan dan tidak menyertakan generated noise.
- Sebelum meminta izin push, sampaikan:

  - ringkasan perubahan;
  - daftar file;
  - migration/config impact;
  - hasil lint/build/test;
  - risiko atau pekerjaan lanjutan;
  - diff yang dapat direview.

- Jangan force-push atau rewrite history tanpa instruksi eksplisit.

## 10. Checklist Pull Request

- [ ] Scope sesuai permintaan dan tidak mengubah copy yang tidak diminta.
- [ ] Tidak ada secret/data pengguna/generated artifact.
- [ ] Auth, authorization, owner isolation, dan error path diuji.
- [ ] Migration non-destruktif dan backward-compatible.
- [ ] UI memakai design token dan responsif.
- [ ] Semua string baru tersedia dalam `id` dan `en`.
- [ ] Dokumentasi mapping diperbarui.
- [ ] Frontend lint/build berhasil.
- [ ] Backend test berhasil.
- [ ] Tidak ada deploy atau push tanpa persetujuan.

