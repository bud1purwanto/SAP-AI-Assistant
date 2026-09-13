# Checkpoint — ActionCard Hooks Lint Fix

Tanggal: 2026-09-13 WIB

## Masalah

Full frontend lint gagal dengan dua error `react-hooks/rules-of-hooks` pada `ActionCard.jsx`.

## Akar Masalah

Komponen melakukan early return untuk `action` invalid sebelum dua pemanggilan `useState`. Bila prop berubah antara invalid dan valid, urutan Hooks berubah antar-render.

Ada juga import `Send` yang tidak pernah dipakai.

## Perbaikan

- Validasi `action` dihitung lebih dahulu sebagai `isValidAction`.
- Destructuring memakai objek kosong ketika action invalid.
- Kedua `useState` selalu dipanggil tanpa kondisi.
- Early return dipindahkan setelah seluruh Hooks.
- Import `Send` dihapus.

## Verifikasi

- Baseline `npx oxlint src/components/ActionCard.jsx`: 2 error Hooks + 1 warning unused import.
- Sesudah perbaikan, scoped lint: bersih.
- `npm run lint`: exit code 0; tidak ada error, hanya warning lama di file lain.
- `npm run build`: sukses.
- `backend/venv/bin/pytest tests/ -q`: 381 test passed.
- `git diff --check`: sukses.
