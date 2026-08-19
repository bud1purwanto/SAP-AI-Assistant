# 🚀 Panduan Deployment SAP AI Assistant ke Server Linux (Production)

Dokumen ini berisi panduan komprehensif langkah demi langkah untuk men-deploy **SAP AI Assistant (FastAPI + React + MCP Gateway + PostgreSQL/SQLite)** ke server Linux (Ubuntu 20.04 / 22.04 / 24.04 LTS atau Debian).

---

## ⚡ Metode 1: Instalasi Otomatis 1-Klik (Tinggal Pakai)

Skrip otomatisasi `deploy/deploy.sh` telah dirancang agar **langsung mendeteksi direktori tempat Anda meletakkan folder project**.

### 1. Salin / Clone Repository ke Server
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

Skrip ini akan otomatis melakukan:
1. Instalasi dependensi sistem Linux (Python 3, venv, Nginx, Node.js v20 LTS, curl).
2. Setup virtual environment Python dan instalasi seluruh requirements backend.
3. Build frontend React (Single Page Application Vite).
4. Pendaftaran dan pengaktifan background daemon `sap-ai-backend.service` via Systemd.
5. Konfigurasi Nginx Web Server reverse proxy ke port 8080.
6. Konfigurasi firewall UFW.

### 3. Konfigurasi Environment Variable
Edit file `.env` di backend jika ingin menyesuaikan API Key atau MCP endpoint:
```bash
nano backend/.env
```
Setelah mengubah `.env`, cukup restart service:
```bash
sudo systemctl restart sap-ai-backend
```

---

## 🌐 Akses Aplikasi & Akun Login Default

Buka browser dan akses alamat IP server Anda:
👉 **`http://<IP_SERVER>:8080`**  *(Contoh: `http://192.168.88.83:8080` atau `http://192.168.254.58:8080`)*

### Akun Super Admin Bawaan:
- **Username:** `TRSTDEV`
- **Password:** `ronin03`
- **Role:** Super Admin (Akses menu Manajemen Pengguna, MCP Gateway, Persona/Prompt System, & API Key).

---

## 🛠️ Perintah Manajemen Server yang Sering Digunakan

| Kebutuhan | Perintah di Terminal Server |
| :--- | :--- |
| **Cek status backend** | `sudo systemctl status sap-ai-backend` |
| **Restart backend** | `sudo systemctl restart sap-ai-backend` |
| **Lihat live log backend** | `sudo journalctl -u sap-ai-backend -f` |
| **Cek status Nginx** | `sudo systemctl status nginx` |
| **Reload Nginx** | `sudo systemctl reload nginx` |

---

## 🔄 Prosedur Pembaruan Kode (Update Code)

Jika nanti Anda melakukan update code dari Git:
```bash
cd ~/sap-ai-assistant
git pull origin main
sudo ./deploy/deploy.sh