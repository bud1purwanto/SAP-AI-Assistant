#!/bin/bash
# ==============================================================================
# Script Cepat Update SAP AI Assistant di Linux Server
# Jalankan: chmod +x deploy/update.sh && sudo ./deploy/update.sh
# ==============================================================================

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "${PROJECT_DIR}"

# Catatan tentang izin repositori.
#
# Versi sebelumnya memeriksa `[ -w .git/objects ]` lebih dulu. Pemeriksaan itu
# LOLOS pada run 43 tetapi git tetap gagal: git menulis ke sub-direktori
# .git/objects/xx dan .git/objects/pack, yang izinnya bisa berbeda dari induknya.
# Menebak dari bit izin ternyata tidak dapat diandalkan, jadi sekarang kegagalan
# git yang sesungguhnya yang dibaca lalu diterjemahkan menjadi petunjuk konkret.

echo "🔄 [1/4] Mengambil kode terbaru dari Git..."
git config --global --add safe.directory "${PROJECT_DIR}" 2>/dev/null || true
git stash --include-untracked 2>/dev/null || true

_fetch_log="$(mktemp)"
if ! git fetch origin main 2>"${_fetch_log}"; then
    cat "${_fetch_log}"
    if grep -q "insufficient permission\|Permission denied\|failed to write object" "${_fetch_log}"; then
        echo ""
        echo "❌ Deploy tidak dapat menulis ke repositori di ${PROJECT_DIR}"
        echo ""
        echo "   Direktori ini dimiliki user lain, sedangkan deploy berjalan"
        echo "   sebagai '$(id -un)'."
        echo ""
        echo "   Jalankan di server, sekali saja:"
        echo "     sudo chown -R $(id -un):$(id -gn) ${PROJECT_DIR}"
        echo ""
    fi
    rm -f "${_fetch_log}"
    exit 1
fi
rm -f "${_fetch_log}"

git reset --hard origin/main

echo "🐍 [2/4] Memeriksa & mengupdate dependensi backend..."
cd "${PROJECT_DIR}/backend"
if [ -f "venv/bin/pip" ]; then
    ./venv/bin/pip install -r requirements.txt --quiet
elif [ -f "/var/www/SAP-AI-Assistant/backend/venv/bin/pip" ]; then
    /var/www/SAP-AI-Assistant/backend/venv/bin/pip install -r requirements.txt --quiet
else
    pip install -r requirements.txt --quiet 2>/dev/null || pip3 install -r requirements.txt --quiet || true
fi

echo "⚛️ [3/4] Melakukan build ulang Frontend..."
cd "${PROJECT_DIR}/frontend"
NODE_ENV=development npm install --include=dev
npm run build

echo "⚙️ [4/4] Merestart service backend..."
sudo systemctl restart sap-ai-backend 2>/dev/null || systemctl restart sap-ai-backend 2>/dev/null || true

echo "=========================================================="
echo "✅ Update selesai & frontend berhasil dibangun!"
echo "=========================================================="
