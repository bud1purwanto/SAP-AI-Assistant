# Checkpoint — Perbaikan Cache Domain ai.abap.web.id

Tanggal: 2026-09-11
Status: selesai, diterapkan pada Nginx aktif, cache Cloudflare telah dipurge, dan terverifikasi live.

## Root cause terverifikasi
- `ai.abap.web.id` menuju origin Nginx `127.0.0.1:8085` melalui Cloudflare.
- Header live origin dan Cloudflare untuk `/sw.js` sebelum penerapan:
  - `Cache-Control: max-age=31536000`
  - `Cache-Control: public, immutable`
  - Cloudflare: `CF-Cache-Status: HIT`
- Browser biasa memakai Service Worker lama; hard refresh melewati cache tersebut.
- IP/Tailscale tidak melewati cache Cloudflare, sehingga update langsung terlihat.

## Perubahan workspace
- `deploy/nginx-sap-ai.conf`
  - port diselaraskan ke `8085`.
  - exact-match `location = /sw.js` dengan no-store.
  - `CDN-Cache-Control: no-store` untuk SW/manifest/register/workbox.
- `deploy/deploy.sh`
  - template origin diselaraskan ke `8085` dan aturan SW sama.
- `deploy/update.sh`
  - tidak lagi menyembunyikan kegagalan sinkronisasi/reload Nginx.
- `tests/test_deploy_cache_config.py`
  - regression guard no-store SW dan port 8085.

## Verifikasi aktual
- `backend/venv/bin/pytest tests/test_deploy_cache_config.py -q`: exit code 0.
- `backend/venv/bin/pytest tests/ -q`: exit code 0.
- `cd frontend && npm run build`: exit code 0.
- `bash -n deploy/update.sh && bash -n deploy/deploy.sh`: exit code 0.

## Penerapan dan verifikasi production
- Konfigurasi aktif `/etc/nginx/sites-available/sap-ai` telah disinkronkan untuk port 8085 oleh skrip penerapan yang dijalankan pengguna.
- Backup dibuat: `/etc/nginx/sites-available/sap-ai.bak-20260911-103538`.
- Nginx aktif setelah graceful reload.
- Cache canonical `https://ai.abap.web.id/sw.js` telah dipurge melalui Cloudflare.
- Empat request canonical berturut-turut menghasilkan `CF-Cache-Status: BYPASS`, tanpa `Age`.
- Header canonical: `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0` dan `CDN-Cache-Control: no-store`.
- SHA-256 origin dan domain sama: `72fbd3b0e236d98c00508929b399c40285f7add13e90867e497391252bf6e930`.
- `index.html` tetap `CF-Cache-Status: DYNAMIC` dengan kebijakan no-cache/no-store.
- Tidak ada file `/var/www/SAP-AI-Assistant` yang diubah dalam perbaikan cache ini.
