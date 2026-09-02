#!/usr/bin/env bash
#
# Menjalankan tes end-to-end: backend (dengan agen tiruan) + frontend hasil build
# + Playwright. Dipakai baik di mesin lokal maupun di CI.
#
# Membutuhkan PostgreSQL yang sudah berjalan dan dapat dihubungi lewat
# E2E_DATABASE_URL.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgresql+psycopg://postgres:postgres@127.0.0.1:5432/sapai_e2e}"
# Dependensi backend dipasang di virtualenv repo. Memakai `python3` sistem
# membuat skrip gagal dengan "No module named uvicorn" pada mesin yang bersih.
if [[ -z "${PYTHON:-}" && -x "$ROOT/.venv/bin/python" ]]; then
    PYTHON="$ROOT/.venv/bin/python"
fi
PYTHON="${PYTHON:-python3}"
# Sebagian lingkungan menyediakan Chromium sendiri di luar cache Playwright.
# Tanpa penunjuk ini Playwright mencari versi persis yang dipinnya dan gagal
# dengan "Executable doesn't exist", padahal peramban yang layak sudah ada.
if [[ -z "${PLAYWRIGHT_CHROMIUM_PATH:-}" && -x "/opt/pw-browsers/chromium" ]]; then
    export PLAYWRIGHT_CHROMIUM_PATH="/opt/pw-browsers/chromium"
fi
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-4173}"

# Tes menulis dan menghapus data. Nama-nama ini menandakan database produksi.
for hint in prod production live; do
    if [[ "${E2E_DATABASE_URL##*@}" == *"$hint"* ]]; then
        echo "❌ E2E_DATABASE_URL tampak menunjuk database produksi; dibatalkan." >&2
        exit 1
    fi
done

pids=()
cleanup() {
    for pid in "${pids[@]:-}"; do
        kill "$pid" 2>/dev/null || true
    done
}
trap cleanup EXIT

# Kuota tamu dinaikkan khusus untuk pengujian. Dengan nilai bawaan, tes yang
# berjalan sebagai tamu akan kehabisan kuota di tengah rangkaian: pesannya
# ditolak 429 dan gejalanya menyerupai fitur yang rusak, padahal bukan.
echo "▶ Menjalankan backend (agen tiruan) di :${BACKEND_PORT}…"
DATABASE_URL="$E2E_DATABASE_URL" \
JWT_SECRET="${JWT_SECRET:-e2e-secret-e2e-secret-e2e-secret-123}" \
BOOTSTRAP_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-AdminPass123}" \
GUEST_DAILY_LIMIT="${E2E_GUEST_LIMIT:-500}" \
    "$PYTHON" -m uvicorn tests.e2e.stub_backend:app \
    --host 127.0.0.1 --port "$BACKEND_PORT" --log-level warning &
pids+=($!)

echo "▶ Menunggu backend siap…"
for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:${BACKEND_PORT}/healthz" >/dev/null; then
        break
    fi
    sleep 1
done
curl -sf "http://127.0.0.1:${BACKEND_PORT}/healthz" >/dev/null || {
    echo "❌ Backend tidak kunjung siap." >&2
    exit 1
}

echo "▶ Membangun frontend…"
cd frontend
# Frontend hasil build memakai URL relatif; arahkan ke backend uji.
VITE_API_BASE_URL="http://127.0.0.1:${BACKEND_PORT}" npm run build >/dev/null

echo "▶ Menjalankan preview di :${FRONTEND_PORT}…"
npx vite preview --port "$FRONTEND_PORT" --host 127.0.0.1 >/dev/null 2>&1 &
pids+=($!)

for _ in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null; then
        break
    fi
    sleep 1
done

echo "▶ Menjalankan Playwright…"
E2E_BASE_URL="http://127.0.0.1:${FRONTEND_PORT}" npx playwright test "$@"
