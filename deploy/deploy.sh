#!/bin/bash
# ==============================================================================
# Script Otomatisasi Deployment SAP AI Assistant untuk Linux (Ubuntu/Debian)
# Jalankan dengan hak akses root atau sudo:
# chmod +x deploy.sh && sudo ./deploy.sh
# ==============================================================================

set -e

echo "🚀 [1/8] Memulai Deployment SAP AI Assistant..."

# 1. Update paket & Install Dependency Sistem
echo "📦 [2/8] Menginstal paket dependensi sistem (Python3, Nginx, Node.js)..."
apt-get update -y
apt-get install -y python3 python3-pip python3-venv nginx curl git ufw

# Install Node.js (v20 LTS) jika belum ada
if ! command -v node &> /dev/null; then
    echo "📥 Menginstal Node.js v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# 2. Buat user sistem untuk service jika belum ada
if ! id "sapai" &>/dev/null; then
    echo "👤 Membuat user sistem 'sapai'..."
    useradd -r -s /bin/false -d /opt/sap-ai-assistant sapai
fi

# 3. Direktori Instalasi
APP_DIR="/opt/sap-ai-assistant"
CURRENT_DIR=$(pwd)

echo "📂 [3/8] Menyiapkan direktori aplikasi di ${APP_DIR}..."
mkdir -p ${APP_DIR}

# Jika script dijalankan dari direktori project, salin file ke /opt/sap-ai-assistant
if [ -d "${CURRENT_DIR}/backend" ] && [ -d "${CURRENT_DIR}/frontend" ]; then
    echo "🔄 Menyalin source code ke ${APP_DIR}..."
    cp -r ${CURRENT_DIR}/backend ${APP_DIR}/
    cp -r ${CURRENT_DIR}/frontend ${APP_DIR}/
    cp -r ${CURRENT_DIR}/deploy ${APP_DIR}/
fi

# 4. Setup Python Virtual Environment & Install Backend Requirements
echo "🐍 [4/8] Menyiapkan Python Virtual Environment untuk Backend..."
cd ${APP_DIR}/backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# Buat .env jika belum ada
if [ ! -f ".env" ]; then
    echo "⚠️ File .env tidak ditemukan, membuat dari template .env.production..."
    if [ -f "${APP_DIR}/deploy/.env.production" ]; then
        cp ${APP_DIR}/deploy/.env.production .env
    elif [ -f ".env.example" ]; then
        cp .env.example .env
    fi
    echo "❗ PENTING: Silakan sesuaikan OPENROUTER_API_KEY dan DATABASE_URL di ${APP_DIR}/backend/.env"
fi

# 5. Build Frontend React
echo "⚛️ [5/8] Membangun Frontend Production (Vite Build)..."
cd ${APP_DIR}/frontend
npm install
npm run build

# 6. Set Permissions
echo "🔒 [6/8] Menyesuaikan hak akses direktori..."
chown -R sapai:sapai ${APP_DIR}
chmod -R 755 ${APP_DIR}

# 7. Setup Systemd Service
echo "⚙️ [7/8] Mendaftarkan Systemd Service..."
if [ -f "${APP_DIR}/deploy/sap-ai-backend.service" ]; then
    cp ${APP_DIR}/deploy/sap-ai-backend.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable sap-ai-backend
    systemctl restart sap-ai-backend
fi

# 8. Setup Nginx Configuration
echo "🌐 [8/8] Mengonfigurasi Web Server Nginx..."
if [ -f "${APP_DIR}/deploy/nginx-sap-ai.conf" ]; then
    cp ${APP_DIR}/deploy/nginx-sap-ai.conf /etc/nginx/sites-available/sap-ai
    # Nonaktifkan default site jika ada
    rm -f /etc/nginx/sites-enabled/default
    # Buat symlink
    ln -sf /etc/nginx/sites-available/sap-ai /etc/nginx/sites-enabled/sap-ai
    # Uji konfigurasi nginx & restart
    nginx -t
    systemctl restart nginx
fi

echo "=========================================================="
echo "🎉 DEPLOYMENT SELESAI & BERHASIL!"
echo "=========================================================="
echo "Status Backend Service:"
systemctl status sap-ai-backend --no-pager || true
echo ""
echo "Aplikasi dapat diakses melalui browser pada IP/Domain server Anda."
echo "Catatan:"
echo "1. Pastikan API key OpenRouter sudah diisi di: ${APP_DIR}/backend/.env"
echo "2. Jika menggunakan PostgreSQL, pastikan database sudah siap."
echo "3. Cek log service backend dengan: journalctl -u sap-ai-backend -f"
echo "=========================================================="