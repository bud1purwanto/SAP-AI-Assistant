#!/bin/bash
# ==============================================================================
# Script Cepat Update SAP AI Assistant di Linux Server
# Jalankan: chmod +x deploy/update.sh && sudo ./deploy/update.sh
# ==============================================================================

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
echo "🔄 [1/4] Mengambil kode terbaru dari Git (git pull)..."
cd "${PROJECT_DIR}"
git pull origin main || git pull

echo "🐍 [2/4] Memeriksa & mengupdate dependensi backend..."
cd "${PROJECT_DIR}/backend"
if [ -d "venv" ]; then
    ./venv/bin/pip install -r requirements.txt --quiet
fi

echo "⚛️ [3/4] Melakukan build ulang Frontend..."
cd "${PROJECT_DIR}/frontend"
npm install --silent
npm run build

echo "⚙️ [4/4] Merestart service backend..."
systemctl restart sap-ai-backend

echo "=========================================================="
echo "✅ Update selesai & service berhasil direstart!"
echo "=========================================================="
