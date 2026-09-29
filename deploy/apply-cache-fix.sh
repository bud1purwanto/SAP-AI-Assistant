#!/bin/bash
# Terapkan perbaikan cache Service Worker pada origin ai.abap.web.id.
# Jalankan sebagai root; tidak menyentuh berkas aplikasi di /var/www.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${PROJECT_DIR}/deploy/nginx-sap-ai.conf"
TARGET="/etc/nginx/sites-available/sap-ai"
BACKUP="${TARGET}.bak-$(date +%Y%m%d-%H%M%S)"

if [[ ${EUID} -ne 0 ]]; then
    echo "ERROR: skrip memerlukan autentikasi root melalui sudo." >&2
    exit 1
fi

if [[ ! -f "${SOURCE}" || ! -f "${TARGET}" ]]; then
    echo "ERROR: konfigurasi sumber atau target tidak ditemukan." >&2
    exit 1
fi

cp --preserve=mode,ownership,timestamps "${TARGET}" "${BACKUP}"
rollback() {
    echo "Validasi gagal; mengembalikan konfigurasi dari ${BACKUP}." >&2
    cp "${BACKUP}" "${TARGET}"
}
trap rollback ERR

install -o root -g root -m 0644 "${SOURCE}" "${TARGET}"
nginx -t
systemctl reload nginx
trap - ERR

sleep 1
headers="$(curl -fsSI --max-time 10 http://127.0.0.1:8085/sw.js)"
printf '%s\n' "${headers}"

if ! grep -qi '^Cache-Control:.*no-store' <<<"${headers}"; then
    echo "ERROR: origin /sw.js belum mengirim Cache-Control no-store." >&2
    exit 1
fi
if grep -qi '^Cache-Control:.*immutable' <<<"${headers}"; then
    echo "ERROR: origin /sw.js masih ditandai immutable." >&2
    exit 1
fi

echo "OK: Nginx aktif sudah memakai kebijakan no-store untuk /sw.js."
echo "Backup: ${BACKUP}"
