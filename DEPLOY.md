# 🚀 Panduan Deployment SAP AI Assistant ke Server Linux (Production)

Dokumen ini berisi panduan komprehensif langkah demi langkah untuk men-deploy **SAP AI Assistant (FastAPI + React + MCP Gateway + PostgreSQL/SQLite)** ke server Linux (Ubuntu 20.04 / 22.04 / 24.04 LTS atau Debian).

---

## 🏗️ Arsitektur Deployment Production

```
                      +-----------------------------+
                      |   Client Web Browser        |
                      +--------------+--------------+
                                     | (Port 8080 HTTP / 443 HTTPS)
                                     v
                      +-----------------------------+
                      |       Nginx Web Server      |
                      |  - Melayani React Static    |
                      |  - Reverse Proxy /api/      |
                      +--------------+--------------+
                                     | (Port 8000 Unix Socket / HTTP)
                                     v
                      +-----------------------------+
                      |  FastAPI Backend (Uvicorn)  |
                      |  - Systemd Service:         |
                      |    sap-ai-backend.service   |
                      +-------+--------------+------+
                              |              |
             (SSE / stdio)    |              | (SQLAlchemy)
                              v              v
+-------------------------------+     +-------------------------------+
|    SAP & RAG MCP Servers      |     |      PostgreSQL / SQLite      |
|  - MCP SAP Gateway            |     |  - User & Roles               |
|  - MCP Vector Knowledge Base  |     |  - Chat Sessions & Messages   |
+-------------------------------+     |  - App Configurations         |
                                      +-------------------------------+
```

---

## 📋 Prasyarat Server (Prerequisites)

1. Server Linux (VPS / Cloud VM / On-Premise) minimal:
   - **RAM:** Minimal 2 GB (Disarankan 4 GB)
   - **vCPU:** Minimal 2 Core
   - **Storage:** Minimal 20 GB SSD
   - **OS:** Ubuntu 22.04 LTS / 24.04 LTS atau Debian 11/12
2. Hak akses `sudo` / `root`.
3. Akun OpenRouter & API Key ([openrouter.ai](https://openrouter.ai)).
4. Node.js (v18+ atau v20 LTS) & Python (v3.10+).

---

## ⚡ Metode 1: Instalasi Cepat Otomatis (Recommended)

Kami telah menyediakan skrip otomatisasi di direktori `deploy/deploy.sh`.

### 1. Salin Repository ke Server
```bash
cd ~
git clone <URL_REPOSITORY_ANDA> sap-ai-assistant
cd sap-ai-assistant
```

### 2. Jalankan Installer Script
```bash
chmod +x deploy/deploy.sh
sudo ./deploy/deploy.sh
```

### 3. Konfigurasi Environment Variable
Edit file `.env` di direktori backend:
```bash
sudo nano /opt/sap-ai-assistant/backend/.env
```
Isi `OPENROUTER_API_KEY` dan kredensial database sesuai kebutuhan. Kemudian restart service:
```bash
sudo systemctl restart sap-ai-backend
```

---

## 🛠️ Metode 2: Langkah Manual Step-by-Step

Jika Anda ingin melakukan instalasi secara bertahap:

### Langkah 1: Update Sistem & Instal Dependensi
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv nginx git curl
```

Instal Node.js v20 LTS:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Langkah 2: Setup Direktori Aplikasi
```bash
sudo mkdir -p /opt/sap-ai-assistant
sudo chown -R $USER:$USER /opt/sap-ai-assistant
cp -r backend frontend deploy /opt/sap-ai-assistant/
```

### Langkah 3: Setup Backend Python
```bash
cd /opt/sap-ai-assistant/backend
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```

Salin file konfigurasi environment:
```bash
cp /opt/sap-ai-assistant/deploy/.env.production /opt/sap-ai-assistant/backend/.env
nano /opt/sap-ai-assistant/backend/.env
```

### Langkah 4: Setup Database PostgreSQL (Opsional tapi Disarankan)
Jika menggunakan PostgreSQL (lebih tangguh untuk multi-user):
```bash
sudo apt install -y postgresql postgresql-contrib

# Masuk ke prompt postgres
sudo -u postgres psql

# Buat database & user
CREATE DATABASE sap_ai_db;
CREATE USER sap_admin WITH ENCRYPTED PASSWORD 'StrongPasswordHere123!';
GRANT ALL PRIVILEGES ON DATABASE sap_ai_db TO sap_admin;
\q
```
Sesuaikan nilai `DATABASE_URL` di `/opt/sap-ai-assistant/backend/.env`:
```ini
DATABASE_URL=postgresql://sap_admin:StrongPasswordHere123!@localhost:5432/sap_ai_db
```
*(Catatan: Jika `DATABASE_URL` dikosongkan, sistem otomatis menggunakan SQLite bawaan).*

### Langkah 5: Build Frontend React
```bash
cd /opt/sap-ai-assistant/frontend
npm install
npm run build
```
Hasil build akan berada di `/opt/sap-ai-assistant/frontend/dist`.

### Langkah 6: Daftarkan Systemd Service (Backend Daemon)
Buat user sistem khusus:
```bash
sudo useradd -r -s /bin/false -d /opt/sap-ai-assistant sapai
sudo chown -R sapai:sapai /opt/sap-ai-assistant
```

Salin file service:
```bash
sudo cp /opt/sap-ai-assistant/deploy/sap-ai-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable sap-ai-backend
sudo systemctl start sap-ai-backend
```

Cek status service backend:
```bash
sudo systemctl status sap-ai-backend
```

### Langkah 7: Konfigurasi Nginx Web Server
Salin konfigurasi Nginx:
```bash
sudo cp /opt/sap-ai-assistant/deploy/nginx-sap-ai.conf /etc/nginx/sites-available/sap-ai
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/sap-ai /etc/nginx/sites-enabled/sap-ai

# Uji konfigurasi
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## 🔒 Langkah 8: Mengamankan Server dengan SSL/HTTPS (Certbot / Let's Encrypt)

Jika Anda menggunakan Domain publik (misal: `sap.perusahaan.com`):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d sap.perusahaan.com
```
Certbot akan otomatis memperbarui file konfigurasi Nginx dengan sertifikat SSL TLS gratis.

---

## 🔍 Perintah Manajemen & Monitoring Harian

| Perintah | Deskripsi |
| :--- | :--- |
| `sudo systemctl status sap-ai-backend` | Memeriksa status backend FastAPI |
| `sudo systemctl restart sap-ai-backend` | Me-restart backend setelah update code |
| `sudo journalctl -u sap-ai-backend -f` | Memantau log backend secara realtime |
| `sudo nginx -t` | Memeriksa validitas konfigurasi Nginx |
| `sudo systemctl reload nginx` | Me-reload konfigurasi Nginx |
| `sudo tail -f /var/log/nginx/sap-ai-access.log` | Memantau traffic Nginx |

---

## 🔄 Prosedur Update Code di Server (CI/CD / Manual Pull)

Setiap kali ada pembaruan kode:
```bash
cd /opt/sap-ai-assistant

# 1. Update kode
git pull origin main

# 2. Update backend dependencies jika ada perubahan
cd backend
./venv/bin/pip install -r requirements.txt

# 3. Rebuild frontend
cd ../frontend
npm install
npm run build

# 4. Restart service
sudo systemctl restart sap-ai-backend
```

## 🌐 Cara Akses Web UI

Akses aplikasi melalui browser:
```
http://<IP_SERVER>:8080
```
Contoh jika server beralamat `192.168.254.58`:
👉 **`http://192.168.254.58:8080`**

*(Port default diatur ke **8080** agar tidak bentrok dengan aplikasi lain yang menggunakan Port 80).*

---

Aplikasi SAP AI Assistant Anda sekarang siap digunakan dengan performa tinggi dan reliabilitas level enterprise! 🚀
