# Checkpoint — Perbaikan Popup Login Berulang

Tanggal: 2026-09-13 WIB

## Masalah

Login API berhasil, tetapi aplikasi segera kembali menjadi tamu sehingga popup login muncul lagi.

## Akar Masalah

`handleLoginSuccess` dan jalur `AUTO_LOGIN_EXECUTE` memanggil `resetToHome()` sesudah `saveSession()`.

Fungsi tersebut selalu:

- mengubah React state menjadi `GUEST_USER`;
- menghapus `sap_assistant_token` dan `sap_assistant_user` dari localStorage.

Efek `isGuest` lalu otomatis membuka LoginModal lagi.

## Perbaikan

`resetToHome(clearAuth = true)` sekarang dapat mereset tampilan tanpa menghapus autentikasi.

Jalur login sukses manual dan auto-login Dashboard memakai `resetToHome(false)` sebelum state user baru diterapkan.

Logout dan sesi berakhir tetap memakai perilaku default `resetToHome()` sehingga token tetap dibersihkan.

## Regression Test

Ditambahkan `frontend/e2e/login.spec.js`.

Test memverifikasi login sukses:

1. modal login tertutup;
2. state sidebar berubah menjadi pengguna terautentikasi;
3. token tersimpan;
4. modal tidak muncul kembali setelah jeda.

## Verifikasi Lokal

- `npx oxlint src/components/ChatLayout.jsx e2e/login.spec.js` — sukses, hanya warning lama pada ChatLayout.
- `npm run build` — sukses.
- `E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/login.spec.js` — 1 passed.
- `backend/venv/bin/pytest tests/test_auth.py -q` — 12 passed.

Catatan: `npm run lint` penuh masih gagal akibat 2 error hook lama di `ActionCard.jsx`, di luar perubahan ini.
