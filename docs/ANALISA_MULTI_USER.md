# Analisa Kesiapan Multi-User — SAP AI Assistant

Dokumen ini menganalisa kondisi aplikasi saat ini terhadap target **diakses banyak user secara bersamaan**, mencakup: (A) bug & risiko, (B) roadmap multi-user, (C) rekomendasi fitur, (D) rekomendasi UI & sistem theme dinamis.

Basis analisa: commit `3fb954d` pada branch `claude/multi-user-app-analysis-roi5s4`.

---

## A. Bug & Risiko

Diurutkan dari yang paling menghambat multi-user.

### A1. 🔴 BLOCKER — Autentikasi hanya berdasarkan header `X-User-Name`

Seluruh endpoint mengidentifikasi user dari header yang dikirim browser, tanpa token/session apa pun:

- `backend/main.py:108, 131, 165, 172, 182, 191, 208, 308` — `request.headers.get("X-User-Name", "Guest")`
- `require_superadmin()` di `backend/main.py:199` juga hanya membaca header yang sama.

Artinya siapa pun dapat menjadi user lain — termasuk superadmin — hanya dengan satu perintah:

```bash
curl -H "X-User-Name: superadmin" http://server:8080/api/admin/users
```

Selama pola ini dipakai, aplikasi **tidak boleh** dibuka ke banyak user. Ini bukan sekadar kelemahan hardening: tidak ada batas keamanan sama sekali antar-user.

**Perbaikan:** login mengembalikan JWT (atau session cookie `HttpOnly` + `SameSite=Lax`) berisi `sub`, `role`, `exp`. Semua endpoint memakai dependency `get_current_user()` yang memverifikasi signature token; header `X-User-Name`/`X-User-Role` dihapus total dari frontend maupun backend.

### A2. 🔴 Password disimpan dan dibandingkan dalam bentuk plaintext

- `backend/database.py:214` — `if row and row.password == pwd_clean`
- `backend/database.py:253` — perbandingan yang sama pada ganti password
- `backend/database.py:632` dan `:658` — insert/update menyimpan password apa adanya
- Kolomnya pun `password VARCHAR(100)` (`backend/database.py:53`)

Satu kali dump DB membocorkan seluruh kredensial user. Karena user cenderung memakai ulang password, dampaknya melampaui aplikasi ini.

**Perbaikan:** `bcrypt`/`argon2` (mis. `passlib`). Migrasi bertahap: tambah kolom `password_hash`, isi saat login berhasil pertama kali, lalu hapus kolom lama.

### A3. 🔴 IDOR — riwayat chat siapa pun bisa dibaca

`GET /api/sessions/{session_id}/messages` (`backend/main.py:189-196`) hanya menolak `Guest`, lalu memanggil `get_chat_messages(session_id)` yang **tidak memfilter pemilik** (`backend/database.py:569`). User A yang mengetahui/menebak `session_id` milik user B akan membaca isi percakapannya.

`session_id` memang acak (`uuid4().hex[:12]`, `database.py:483`) sehingga tidak mudah ditebak, tetapi ia bocor lewat endpoint audit dan tetap bukan kontrol akses. Bandingkan dengan `delete_chat_session()` (`database.py:526`) yang sudah benar memfilter `username`.

**Perbaikan:** tambahkan parameter `username` pada `get_chat_messages()` dan `JOIN`/`WHERE` ke `chat_sessions.username`, kecuali untuk jalur admin yang eksplisit.

### A4. 🔴 State MCP bersifat global, bocor antar-user

`mcp_manager` adalah singleton proses (`backend/mcp_manager.py`), dan `set_active_sap_server()` (`:256`) mengubah *server aktif pada MCP SAP itu sendiri*, dipanggil dari `agent.py:63` mengikuti pilihan user yang sedang mengirim pesan.

Dengan dua user aktif bersamaan: user A memilih `sandbox`, user B memilih `production`; request B menggeser server aktif, lalu tool-call milik A yang sedang berjalan mengeksekusi query ke sistem SAP yang salah. Ini race condition yang **diam** — tidak error, hanya menghasilkan data dari sistem yang keliru. Pada data SAP produksi, konsekuensinya serius.

Diperparah `--workers 2` di `deploy/sap-ai-backend.service:13`: dua proses dengan state masing-masing, sehingga perilakunya juga tidak konsisten antar-request.

**Perbaikan:** kirim target server sebagai parameter per-tool-call, bukan mode global. Jika protokol MCP mengharuskan `set_active_server`, serialisasikan pasangan set+call di bawah satu `asyncio.Lock` per alias server, atau pakai koneksi/klien MCP terpisah per target.

### A5. 🟠 `App.jsx` adalah kode mati — ~394 baris yang tidak berpengaruh apa pun

`main.jsx` merender `<App />`, dan `App.jsx` merender `<ChatLayout ...20+ props />`. Tetapi `ChatLayout` dideklarasikan sebagai `const ChatLayout = () => {` (`ChatLayout.jsx:13`) — **tanpa parameter props**. Semua prop diabaikan; `ChatLayout` mengelola sendiri state user, sesi, pesan, dan theme-nya.

Akibat nyata:

1. **Dua sumber kebenaran untuk theme.** `App.jsx` default `'light'`, `ChatLayout` default `'dark'` (`ChatLayout.jsx:26`), keduanya menulis key `sap_assistant_theme` yang sama dan memanipulasi `documentElement.classList`. Pada pemuatan pertama (localStorage kosong) keduanya berebut → kelas `dark` sempat dipasang lalu dicabut, tampak sebagai flash.
2. **Dua `LoginModal` ter-mount** — satu dari `App`, satu dari `ChatLayout`.
3. Setiap perbaikan yang dilakukan di `App.jsx` tidak akan terlihat di aplikasi, dan sebaliknya. Ini jebakan maintenance yang mahal.

**Perbaikan:** hapus logika di `App.jsx` sampai tersisa shell (provider + render `ChatLayout`), atau balikkan arahnya — angkat state ke `App` dan jadikan `ChatLayout` presentational. Jangan biarkan keduanya hidup.

### A6. 🟠 Role `'guest'` vs `'user'` tidak konsisten

`ChatLayout` memakai `role: 'guest'` (`:46, :118, :200, :264, :337, :344, :460`), sedangkan `App.jsx` memakai `role: 'user'` untuk pengguna tamu, dan backend justru mendeteksi tamu dari **username** `"Guest"`. Tiga konvensi untuk satu konsep. Backend juga menerima `X-User-Role` dari klien (`main.py:313`) — nilai yang seharusnya tidak pernah dipercaya dari sisi klien.

### A7. 🟠 Limit Guest sepenuhnya di sisi klien

Kuota 1 prompt/hari disimpan di `localStorage` (`ChatLayout.jsx:94-100, :277`). Cukup hapus site data untuk mereset. Untuk multi-user publik, kuota harus dihitung di server (per akun / per IP).

### A8. 🟠 Kredensial produksi ter-commit di repo

`deploy/.env.production` terlacak git dan memuat `DATABASE_URL` (beserta password), `NINE_ROUTER_API_KEY`, dan `OPENROUTER_API_KEY`. Root `.gitignore` sudah mengabaikan `.env`, tetapi nama `.env.production` lolos dari pola itu.

**Perbaikan:** rotasi semua kredensial di dalamnya, jadikan file itu `deploy/.env.production.example` berisi placeholder, tambahkan pola `.env.*` (dengan pengecualian `*.example`) ke `.gitignore`, dan bersihkan dari riwayat git bila repo pernah publik.

### A9. 🟠 `allow_origins=["*"]` bersama `allow_credentials=True`

`backend/main.py:38-44`. Kombinasi ini ditolak browser bila nanti pindah ke cookie, dan saat ini membuat API bisa dipanggil dari origin mana pun. Batasi ke domain frontend yang sebenarnya.

### A10. 🟡 API key ikut terkirim ke frontend

`GET /api/config` (`main.py:116`) mengembalikan `nine_router_api_key` dan `openrouter_api_key` ke **semua** user yang login, bukan hanya superadmin — padahal penulisannya sudah dibatasi superadmin (`main.py:139`). Kembalikan hanya penanda `is_set: true` / nilai termasker.

### A11. 🟡 SQLite fallback berbahaya dengan banyak worker

`get_engine()` (`database.py:15-35`) diam-diam jatuh ke SQLite bila PostgreSQL tidak terjangkau. Dengan `--workers 2`, dua proses menulis ke file SQLite yang sama → `database is locked` dan data terbelah; dan kegagalan DB produksi jadi tidak terlihat karena aplikasi tetap "jalan" dengan data kosong. Untuk produksi, gagal-cepat lebih baik daripada fallback senyap.

### A12. 🟡 Koneksi HTTP polos

`deploy/nginx-sap-ai.conf:15` — `listen 8080;` tanpa TLS. Username dan password melintas jaringan dalam bentuk teks biasa. Terminasikan TLS sebelum aplikasi dipakai banyak orang.

### A13. 🟡 Deprecation & kerapian

- `@app.on_event("startup")` (`main.py:47`) sudah deprecated di FastAPI modern — gunakan `lifespan`.
- `s.dict()` (`main.py:341`) deprecated di Pydantic v2 — gunakan `s.model_dump()`.
- Dua route menempel pada satu handler (`main.py:188-190`) sehingga `/api/history/{id}` tidak terdokumentasi dengan benar di OpenAPI.
- `import os` ganda di `backend/config.py:1` dan `:4`.
- File debug ikut di repo: `backend/test.py`, `debug.py`, `direct_mcp_test.py`, `test_mcp.py`.

---

## B. Roadmap Multi-User

Urutan ini disusun agar setiap tahap tetap bisa dirilis.

**Fase 1 — Fondasi keamanan (wajib sebelum user kedua masuk)**

1. Hash password (A2) — termasuk skrip migrasi user yang sudah ada.
2. JWT / session cookie + `get_current_user()` dependency (A1); hapus `X-User-Name` dari seluruh frontend.
3. Filter kepemilikan pada seluruh query sesi & pesan (A3).
4. TLS (A12), CORS spesifik (A9), rotasi kredensial yang bocor (A8).

**Fase 2 — Kebenaran di bawah beban bersamaan**

5. Hilangkan state MCP global (A4) — ini penentu apakah aplikasi boleh dipakai >1 user pada saat yang sama.
6. Tegakkan PostgreSQL di produksi; SQLite hanya untuk pengembangan lokal (A11).
7. Rate limit dan kuota di sisi server (A7).

**Fase 3 — Skala & operasional**

8. Refresh token + logout yang benar-benar mencabut sesi.
9. Audit log terstruktur: siapa menjalankan tool SAP apa, kapan, terhadap sistem mana.
10. Streaming respons (SSE) supaya request panjang tidak menahan worker.
11. Health check `/healthz` (DB + MCP) untuk pemantauan.

**Fase 4 — Konsolidasi frontend**

12. Bereskan duplikasi `App.jsx`/`ChatLayout.jsx` (A5), lalu terapkan sistem theme di bagian D.

---

## C. Rekomendasi Fitur

**Yang langsung terasa manfaatnya untuk lingkungan multi-user:**

- **Organisasi / tim (tenant).** Satu instance melayani beberapa departemen; sesi, persona, dan hak akses SAP diikat ke tenant. Lebih baik dirancang sekarang selagi skema masih kecil.
- **RBAC yang lebih halus.** Saat ini hanya `user` dan `superadmin`. Peran `auditor` (baca-saja atas audit log) dan `operator` (boleh memilih target SAP produksi) memisahkan kewenangan yang saat ini menyatu.
- **Izin per-server SAP.** Tidak semua user layak menyentuh sistem produksi. Whitelist alias SAP per user/role, ditegakkan di backend — bukan sekadar disembunyikan di dropdown.
- **Kuota & biaya per user.** Hitung token/panggilan per user, tampilkan di dashboard admin. Dengan LLM berbayar, ini kebutuhan operasional, bukan kemewahan.
- **Persona bersama.** Persona kini per-user (`assistant_persona`). Template persona level organisasi yang dikurasi admin membuat jawaban konsisten antar-tim.
- **Berbagi percakapan.** Link read-only ke satu sesi untuk dilampirkan ke tiket — kebutuhan yang muncul segera setelah aplikasi dipakai bersama.
- **Ekspor sesi** ke Markdown/PDF untuk dokumentasi insiden.
- **Pencarian riwayat** lintas sesi; daftar sesi yang panjang cepat menjadi tidak terpakai tanpa ini.

**Peningkatan pengalaman chat:**

- **Streaming token.** Perubahan tunggal dengan dampak persepsi kecepatan terbesar; saat ini user menunggu tanpa umpan balik hingga jawaban lengkap tiba.
- **Stop generation.** Belum ada cara membatalkan permintaan yang berjalan lama.
- **Regenerate & edit pesan.**
- **Tool-call transparency.** Panel `sources` sudah ada; tampilkan pula tool SAP yang dipanggil beserta parameternya — penting untuk kepercayaan pada jawaban berbasis data ERP.
- **Prompt library** per organisasi untuk pertanyaan SAP yang berulang.

---

## D. Rekomendasi UI & Theme Dinamis

### D1. Masalah pada pendekatan theme sekarang

Warna ditulis langsung sebagai pasangan literal Tailwind di seluruh markup — `ChatLayout.jsx` saja memuat ratusan pasangan seperti `bg-slate-50 dark:bg-zinc-950`, `text-slate-600 dark:text-zinc-400`. Konsekuensinya:

- Menambah theme ketiga berarti menyunting setiap baris JSX.
- Palet menyimpang perlahan: sisi terang memakai `slate`, sisi gelap memakai `zinc` dan `slate` bercampur.
- Warna aksen `indigo` tersebar hard-coded, sehingga branding per organisasi mustahil tanpa find-replace massal.
- Hanya ada dua pilihan; preferensi OS (`prefers-color-scheme`) tidak dihormati.

### D2. Pindah ke design token semantik

Tailwind v4 (sudah dipakai di proyek ini) mendukung ini secara native lewat `@theme`. Definisikan token berdasarkan *peran*, bukan nama warna:

```css
/* index.css */
@theme {
  --color-surface:        var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-border:         var(--border);
  --color-content:        var(--content);
  --color-content-muted:  var(--content-muted);
  --color-accent:         var(--accent);
  --color-accent-fg:      var(--accent-fg);
}

:root, [data-theme="light"] {
  --surface: #f8fafc; --surface-raised: #ffffff;
  --border: #e2e8f0;  --content: #0f172a;
  --content-muted: #64748b;
  --accent: #4f46e5;  --accent-fg: #ffffff;
}

[data-theme="dark"] {
  --surface: #09090b; --surface-raised: #18181b;
  --border: #27272a;  --content: #fafafa;
  --content-muted: #a1a1aa;
  --accent: #818cf8;  --accent-fg: #1e1b4b;
}

/* Ikut preferensi OS saat user memilih "system" */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* token dark yang sama */ }
}
```

Markup menjadi netral-theme dan jauh lebih ringkas:

```jsx
// sebelum
<div className="bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-slate-100">
// sesudah
<div className="bg-surface text-content">
```

Keuntungannya berlipat: theme baru = satu blok `[data-theme="..."]`, aksen per-organisasi cukup meng-override `--accent` saat runtime, dan kontras dapat diaudit di satu tempat.

### D3. Kontrol theme yang seharusnya

Ganti toggle biner dengan tiga pilihan **Light / Dark / System**, disimpan sebagai satu nilai (`'light' | 'dark' | 'system'`) dan diterapkan di satu tempat saja — hook `useTheme()` yang menulis `data-theme` pada `<html>`. Ini juga menyelesaikan A5 poin 1.

Untuk mencegah kedipan tema saat halaman dimuat, sisipkan skrip singkat di `index.html` sebelum bundle React, yang membaca localStorage dan memasang `data-theme` lebih dulu.

Setelah tersentralisasi, tambahan berikut menjadi murah: **preferensi theme tersimpan di profil user** (ikut berpindah antar-perangkat — relevan untuk multi-user), **aksen per-organisasi**, dan mode **high-contrast** untuk aksesibilitas.

### D4. Perbaikan UI lain

- **Responsif / mobile.** Sidebar memakai lebar tetap `w-72` tanpa breakpoint (`ChatLayout.jsx:357`); di layar sempit, area chat terhimpit. Jadikan drawer di bawah `md`.
- **Aksesibilitas.** Tombol ikon-saja belum memiliki `aria-label`; modal belum melakukan focus trap dan belum menutup dengan `Esc`. Ukuran teks `text-[10px]`/`text-[11px]` di sidebar berada di bawah ambang keterbacaan yang nyaman.
- **Penanda identitas.** Dalam aplikasi multi-user, tampilkan avatar + role sebagai badge yang jelas, dan beri **indikator visual tegas saat target SAP adalah sistem produksi** (misalnya bilah peringatan berwarna) — ini mitigasi UX untuk risiko di A4.
- **Empty state & error.** Error saat ini muncul sebagai gelembung chat berisi teks `**Error:** ...` (`App.jsx`) — pindahkan ke komponen error yang bisa dicoba ulang.
- **Skeleton loading** sudah ada untuk daftar sesi; terapkan pola yang sama pada pemuatan pesan.
- **Reduced motion.** Hormati `prefers-reduced-motion` untuk animasi `float` dan `animate-pulse` di `index.css`.

---

## Ringkasan

Untuk pertanyaan inti — *apakah aplikasi ini siap diakses banyak user?* — jawabannya belum, dan penghalangnya spesifik: **A1 (autentikasi hanya header), A2 (password plaintext), A3 (riwayat chat lintas user), dan A4 (state MCP global yang menyilangkan target sistem SAP antar-user).** Empat hal itu sebaiknya diselesaikan sebelum akun kedua dibuat.

Sisanya — konsolidasi frontend (A5) dan sistem theme berbasis token (D2) — bukan penghalang, tetapi keduanya menurunkan biaya setiap perubahan UI berikutnya, sehingga layak dikerjakan lebih awal.
