#!/bin/bash
# ==============================================================================
# Script Cepat Update SAP AI Assistant di Linux Server
# Jalankan: chmod +x deploy/update.sh && sudo ./deploy/update.sh
# ==============================================================================

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
echo "🔄 [1/4] Mengambil kode terbaru dari Git..."
cd "${PROJECT_DIR}"
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
