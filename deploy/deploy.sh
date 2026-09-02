#!/bin/bash
# ==============================================================================
# Script Otomatisasi Deployment SAP AI Assistant untuk Linux (Ubuntu/Debian)
# Jalankan langsung di direktori project:
# chmod +x deploy/deploy.sh && sudo ./deploy/deploy.sh
# ==============================================================================

set -e

echo "🚀 [1/7] Memulai Deployment SAP AI Assistant..."

# 1. Update paket & Install Dependency Sistem
echo "📦 [2/7] Menginstal paket dependensi sistem (Python3, python3-venv, Nginx, Node.js)..."
apt-get update -y
apt-get install -y python3 python3-pip python3-venv nginx curl git ufw

# Install Node.js (v20 LTS) jika belum ada
if ! command -v node &> /dev/null; then
    echo "📥 Menginstal Node.js v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# 2. Tentukan Direktori Proyek
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
echo "📂 Direktori Project terdeteksi di: ${PROJECT_DIR}"

# 3. Setup Python Virtual Environment & Install Backend Requirements
echo "🐍 [3/7] Menyiapkan Python Virtual Environment untuk Backend..."
cd ${PROJECT_DIR}/backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# Buat .env jika belum ada
if [ ! -f ".env" ]; then
    echo "⚠️ File .env tidak ditemukan, membuat dari template..."
    if [ -f "${PROJECT_DIR}/deploy/.env.production.example" ]; then
        cp ${PROJECT_DIR}/deploy/.env.production.example .env
    elif [ -f ".env.example" ]; then
        cp .env.example .env
    fi
    echo "‼️  .env dibuat dari template berisi PLACEHOLDER."
    echo "‼️  Isi DATABASE_URL, API key, dan JWT_SECRET sebelum menjalankan layanan."
fi

# JWT_SECRET wajib ada: tanpa itu sesi login gugur setiap restart dan
# tidak konsisten antar worker uvicorn.
if ! grep -qE '^JWT_SECRET=.+' .env || grep -qE '^JWT_SECRET=(ganti-dengan-secret-acak-panjang)?$' .env; then
    echo "🔐 Membuat JWT_SECRET acak..."
    NEW_SECRET=$(openssl rand -base64 48 | tr -d '\n')
    if grep -q '^JWT_SECRET=' .env; then
        sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_SECRET}|" .env
    else
        echo "JWT_SECRET=${NEW_SECRET}" >> .env
    fi
fi

# 4. Build Frontend React
echo "⚛️ [4/7] Membangun Frontend Production (Vite Build)..."
cd ${PROJECT_DIR}/frontend
npm install
npm run build

# 5. Generate Systemd Service secara Dinamis sesuai direktori proyek
echo "⚙️ [5/7] Mendaftarkan Systemd Service (sap-ai-backend)..."
cat << EOF > /etc/systemd/system/sap-ai-backend.service
[Unit]
Description=SAP AI Assistant FastAPI Backend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${PROJECT_DIR}/backend
Environment="PATH=${PROJECT_DIR}/backend/venv/bin:/usr/local/bin:/usr/bin"
EnvironmentFile=-${PROJECT_DIR}/backend/.env
ExecStart=${PROJECT_DIR}/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8005 --workers 2
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sap-ai-backend
systemctl restart sap-ai-backend

# 6. Generate Nginx Configuration secara Dinamis sesuai direktori frontend/dist
echo "🌐 [6/7] Mengonfigurasi Web Server Nginx (Port 8080)..."
cat << EOF > /etc/nginx/sites-available/sap-ai
upstream sap_backend {
    server 127.0.0.1:8005;
    keepalive 32;
}

server {
    listen 8080;
    server_name sap-ai.local _;

    root ${PROJECT_DIR}/frontend/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/x-javascript application/json application/xml image/svg+xml;
    gzip_disable "MSIE [1-6]\.";

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    location /api {
        proxy_pass http://sap_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    location ~* \.(?:css|js|jpg|jpeg|gif|png|ico|cur|gz|svg|svgz|mp4|ogg|ogv|webm|htc|woff|woff2)\$ {
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    access_log /var/log/nginx/sap-ai-access.log;
    error_log /var/log/nginx/sap-ai-error.log;
}
EOF

ln -sf /etc/nginx/sites-available/sap-ai /etc/nginx/sites-enabled/sap-ai

# Izinkan port 8080 di firewall jika UFW aktif
if command -v ufw &> /dev/null; then
    ufw allow 8080/tcp || true
fi

# Uji konfigurasi nginx & reload
nginx -t
systemctl reload nginx

echo "=========================================================="
echo "🎉 [7/7] DEPLOYMENT SELESAI & BERHASIL!"
echo "=========================================================="
echo "Status Backend Service:"
systemctl status sap-ai-backend --no-pager || true
echo ""
echo "Aplikasi siap diakses pada browser di:"
echo "👉 http://<IP_SERVER>:8080  (Contoh: http://192.168.88.83:8080)"
echo "Akun Super Admin Default:"
echo "Username: TRSTDEV"
echo "Password: ronin03"
echo "=========================================================="