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
### Variabel wajib di produksi

| Variabel | Kegunaan |
| :--- | :--- |
| `JWT_SECRET` | Kunci penandatangan token login. Wajib diisi dan sama di semua worker — bila kosong, server memakai secret acak sehingga semua sesi gugur tiap restart. Buat dengan `openssl rand -base64 48`. |
| `DATABASE_URL` | Koneksi PostgreSQL. |
| `REQUIRE_POSTGRES` | Set `true` agar startup gagal ketika PostgreSQL tidak terjangkau, alih-alih diam-diam melayani SQLite kosong. |
| `CORS_ALLOW_ORIGINS` | Origin frontend yang diizinkan (hindari `*`). |
| `BOOTSTRAP_ADMIN_PASSWORD` | Password superadmin awal saat instalasi pertama. |
| `GUEST_DAILY_LIMIT` | Kuota prompt harian untuk pengunjung tanpa login. |

> **Catatan keamanan:** aplikasi ini melayani beberapa user, sehingga password dan
> token melintas jaringan. Terminasikan TLS (HTTPS) di depan Nginx sebelum
> membukanya ke pengguna; konfigurasi bawaan masih `listen 8080` tanpa TLS.

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

### Akun Super Admin Bootstrap:
- **Username:** `TRSTDEV`
- **Password:** diambil dari `BOOTSTRAP_ADMIN_PASSWORD` di `backend/.env`, dan hanya dipakai ketika tabel `users` masih kosong.
- **Role:** Super Admin (Akses menu Manajemen Pengguna, MCP Gateway, Persona/Prompt System, & API Key).

> **Ganti password ini lewat menu Settings segera setelah login pertama.** Password
> disimpan sebagai hash bcrypt; tidak ada kredensial cadangan yang tertanam di kode.

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

## 🔄 Prosedur Pembaruan Kode (Update Code di Server)

### Cara Cepat (Manual via Script):
Setelah Anda melakukan `git push` dari komputer lokal, jalankan perintah ini di terminal server Linux:
```bash
cd ~/sap-ai-assistant  # sesuaikan dengan folder project Anda
chmod +x deploy/update.sh
sudo ./deploy/update.sh
```
*Skrip `update.sh` akan otomatis melakukan `git pull`, install dependensi terbaru, build frontend, dan restart service.*

---

## ⚡ Apakah Bisa Otomatis Fetch Saat Git Push?

Secara default, Git adalah sistem pull/manual sehingga server Linux **tidak otomatis fetch sendiri** kecuali dipasangi trigger otomatis.

Jika Anda ingin server **otomatis update tanpa login SSH**, ada 2 pilihan mudah:

### Opsi A: Menggunakan Cron Job (Paling Praktis, cek update tiap X menit)
Di terminal server Linux, ketik:
```bash
crontab -e
```
Tambahkan baris berikut di bagian paling bawah (misal cek update setiap 5 menit):
```cron
*/5 * * * * cd /path/ke/sap-ai-assistant && git fetch && [ $(git rev-parse HEAD) != $(git rev-parse @{u}) ] && bash deploy/update.sh >> /var/log/sap-ai-autoupdate.log 2>&1
```

### Opsi B: Webhook / CI-CD (GitHub Actions / GitLab CI)
Jika repository ada di GitHub/GitLab, Anda bisa menggunakan GitHub Actions Runner atau Webhook yang memanggil script deploy saat ada push ke branch `main`.