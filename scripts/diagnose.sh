#!/usr/bin/env bash
# Pemeriksaan cepat saat aplikasi "tidak nyambung".
# Jalankan dari root proyek:  bash scripts/diagnose.sh
set -uo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }
info() { printf '    %s\n' "$1"; }

echo
echo "=== 1. Berkas konfigurasi ==="
if [ -f backend/.env ]; then
  ok "backend/.env ada"
  grep -q '^DATABASE_URL=.\+' backend/.env && ok "DATABASE_URL terisi" \
    || bad "DATABASE_URL kosong — salin dari backend/.env.example"
  grep -q '^JWT_SECRET=.\+' backend/.env && ok "JWT_SECRET terisi" \
    || bad "JWT_SECRET kosong — sesi login akan gugur setiap restart"
else
  bad "backend/.env tidak ada"
  info "jalankan: cp backend/.env.example backend/.env"
fi

echo
echo "=== 2. Database ==="
DB_URL=$(grep -m1 '^DATABASE_URL=' backend/.env 2>/dev/null | cut -d= -f2-)
DB_HOSTPORT=$(printf '%s' "${DB_URL:-}" | sed -n 's|.*@\([^/]*\)/.*|\1|p')
DB_HOST="${DB_HOSTPORT%%:*}"; DB_PORT="${DB_HOSTPORT##*:}"
if [ -n "${DB_HOST:-}" ]; then
  if (exec 3<>"/dev/tcp/${DB_HOST}/${DB_PORT}") 2>/dev/null; then
    ok "PostgreSQL menerima koneksi di ${DB_HOSTPORT}"
  else
    bad "PostgreSQL TIDAK dapat dihubungi di ${DB_HOSTPORT}"
    info "Aplikasi memerlukan PostgreSQL — dukungan SQLite sudah dihapus."
    info "Untuk lokal jalankan: docker compose up -d"
  fi
else
  bad "DATABASE_URL tidak dapat dibaca"
fi

echo
echo "=== 3. Backend ==="
HEALTH=$(curl -s --max-time 5 "${BACKEND_URL}/healthz" 2>/dev/null)
if [ -n "$HEALTH" ]; then
  ok "backend merespons di ${BACKEND_URL}"
  info "$HEALTH"
else
  bad "backend TIDAK merespons di ${BACKEND_URL}"
  info "jalankan: cd backend && uvicorn main:app --reload"
  info "(jika backend gagal start, pesan alasannya tercetak di terminalnya)"
fi

echo
echo "=== 4. Alamat API yang dipakai frontend ==="
if [ -f frontend/.env ] && grep -q '^VITE_API_BASE_URL=' frontend/.env; then
  info "frontend/.env → $(grep -m1 '^VITE_API_BASE_URL=' frontend/.env)"
else
  info "VITE_API_BASE_URL tidak diset."
  info "Mode dev memakai http://127.0.0.1:8000 — pastikan backend di port itu."
  info "Mode produksi memakai origin yang sama (dilayani Nginx)."
fi

echo
echo "=== 5. Server MCP SAP (opsional) ==="
info "Bila header menampilkan 'Menghubungkan…', server MCP SAP tidak terjangkau."
info "Asisten tetap menjawab pertanyaan umum, tetapi tidak bisa mengambil data SAP."
echo
