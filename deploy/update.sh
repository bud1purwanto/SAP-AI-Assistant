#!/bin/bash
# ==============================================================================
# Script Cepat Update SAP AI Assistant di Linux Server
# Jalankan: chmod +x deploy/update.sh && sudo ./deploy/update.sh
# ==============================================================================

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "${PROJECT_DIR}"

# Pemeriksaan awal: runner harus bisa menulis ke .git, jika tidak `git fetch`
# gagal dengan "insufficient permission for adding an object to repository
# database" di tengah proses. Lebih baik berhenti di sini dengan pesan yang
# menyebutkan perbaikannya.
if [ ! -w "${PROJECT_DIR}/.git/objects" ]; then
    echo "❌ Tidak dapat menulis ke ${PROJECT_DIR}/.git/objects"
    echo ""
    echo "   Direktori repositori dimiliki user lain, sehingga proses deploy"
    echo "   (berjalan sebagai '$(id -un)') tidak dapat memperbarui kode."
    echo ""
    echo "   Perbaiki di server dengan menyerahkan kepemilikan ke user runner:"
    echo "     sudo chown -R $(id -un):$(id -gn) ${PROJECT_DIR}"
    echo ""
    exit 1
fi

echo "🔄 [1/4] Mengambil kode terbaru dari Git..."
git config --global --add safe.directory "${PROJECT_DIR}" 2>/dev/null || true
git stash --include-untracked 2>/dev/null || true
git fetch origin main
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
npm install --silent
npm run build

echo "⚙️ [4/4] Merestart service backend..."
sudo systemctl restart sap-ai-backend 2>/dev/null || systemctl restart sap-ai-backend

echo "=========================================================="
echo "✅ Update selesai & service berhasil direstart!"
echo "=========================================================="
