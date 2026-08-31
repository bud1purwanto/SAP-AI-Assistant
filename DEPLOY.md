# 🚀 Panduan Deployment SAP AI Assistant ke Server Linux (Production)

Dokumen ini berisi panduan komprehensif langkah demi langkah untuk men-deploy **SAP AI Assistant (FastAPI + React + MCP Gateway + PostgreSQL)** ke server Linux (Ubuntu 20.04 / 22.04 / 24.04 LTS atau Debian).

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

### 3. Konfigurasi Environment Variable & Database

#### Variabel Wajib di `.env` (Level Server / Infrastruktur):
| Variabel | Kegunaan |
| :--- | :--- |
| `DATABASE_URL` | Koneksi PostgreSQL (**Wajib**). Semua riwayat chat, user, config MCP, dan skill disimpan di sini. |
| `JWT_SECRET` | Kunci penandatangan token login JWT (**Wajib** di produksi). Buat dengan `openssl rand -base64 48`. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Password akun superadmin awal `TRSTDEV` saat tabel users pertama kali diinisialisasi. |
| `CORS_ALLOW_ORIGINS` | Origin frontend yang diizinkan (gunakan `*` atau domain/IP Anda). |
| `QUOTA_TIMEZONE` | Zona waktu penentu pergantian hari kuota token (bawaan `Asia/Jakarta`). Dengan UTC, kuota tim Indonesia akan reset pukul 07.00 — di tengah jam kerja. |

#### Peran Pengguna

| Peran | Hak |
| :--- | :--- |
| `superadmin` | Seluruh akses, termasuk Dashboard Admin dan pengaturan kuota. Tanpa batas token. |
| `abaper` | Boleh membaca **dan mengubah** objek/program di SAP. |
| `functional` | Hanya membaca data dan program; permintaan perubahan ditolak. |
| `user` | Pengguna umum dengan kuota paling kecil. |

Tool MCP yang mengubah objek SAP tidak sekadar disembunyikan dari peran yang tidak
berhak — definisinya tidak dikirim ke model sama sekali, sehingga tidak ada cara
memanggilnya lewat prompt.

#### Kuota Token

Penegakan batas dinyalakan/dimatikan admin lewat **Dashboard Admin → Kuota Token**.
Saat dimatikan, pemakaian tetap dicatat sehingga admin punya angka nyata sebelum
menetapkan batas. Batas harian dan batas permintaan per menit diatur per peran, dan
pemakaian harian dapat dinolkan per pengguna atau sekaligus.

> **Catatan Keamanan & Kemudahan:**
> Konfigurasi **AI Provider (9Router, OpenRouter API Keys)**, **Server MCP (SAP, RAG, Email)**, **Persona Organisasi**, dan **Katalog Skill** disimpan di Database PostgreSQL dan dapat diatur langsung secara visual lewat menu **Dashboard Admin (UI)** di browser. Anda **tidak perlu mengedit `.env` atau merestart service** untuk mengganti model AI atau server MCP!

Jika ingin mengubah konfigurasi level server (misal database atau secret key):
```bash
nano backend/.env
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

## 🧪 Menjalankan di Komputer Lokal

Aplikasi memerlukan PostgreSQL — dukungan SQLite sudah dihapus, sehingga backend
**menolak start** bila database tidak terjangkau (ini disengaja: lebih baik gagal
jelas daripada diam-diam melayani database kosong).

```bash
docker compose up -d                      # PostgreSQL untuk pengembangan
cp backend/.env.example backend/.env      # isi seperlunya
cd backend && pip install -r requirements.txt && uvicorn main:app --reload
cd frontend && npm install && npm run dev
```

Bila tampilan "tidak nyambung" (jawaban kosong, riwayat kosong, header
"Menghubungkan…"), jalankan pemeriksaan cepat:

```bash
bash scripts/diagnose.sh
```

Skrip itu memeriksa `.env`, koneksi database, apakah backend merespons, dan
alamat API yang dipakai frontend.

---

## 🤖 Deployment Otomatis (GitHub Actions)

Setiap push ke `main` menjalankan dua job berurutan:

1. **verify** — build frontend, `oxlint`, dan `pytest` (di runner GitHub).
2. **deploy** — `deploy/update.sh` di self-hosted runner, **hanya bila verify lulus**.

### Izin direktori di server (penyebab tersering)

Proses deploy berjalan sebagai user runner GitHub, bukan `root`. Bila direktori
proyek dimiliki user lain, `git fetch` gagal dengan
`insufficient permission for adding an object to repository database`.

Perbaiki sekali di server:

```bash
# cari user yang menjalankan runner
ps -o user= -p "$(pgrep -f Runner.Listener | head -1)"

# serahkan kepemilikan proyek ke user tersebut
sudo chown -R <user-runner>:<user-runner> /var/www/SAP-AI-Assistant

# runner juga perlu me-restart service tanpa password
echo "<user-runner> ALL=(ALL) NOPASSWD: /bin/systemctl restart sap-ai-backend" \
  | sudo tee /etc/sudoers.d/sap-ai-deploy
```

**Bila deploy tidak berjalan otomatis**, periksa tab **Actions** di GitHub:

| Yang terlihat | Artinya | Tindakan |
| :--- | :--- | :--- |
| `insufficient permission ... .git/objects` | Kepemilikan direktori salah | Jalankan `chown` di atas |
| `chmod: Operation not permitted` | Workflow memakai `chmod` yang tidak perlu | Sudah dihapus; pastikan workflow terbaru |
| `deploy` menggantung "Queued" | Runner mati, atau label `runs-on` tidak cocok dengan label runner | Nyalakan runner; cocokkan label |
| Run gagal 0 detik, nama run = path berkas | YAML workflow tidak valid | Perbaiki sintaks `deploy.yml` |
| `verify` merah | Test/lint gagal | Deploy tetap jalan; perbaiki kodenya |

Job `verify` berjalan paralel dan **tidak** memblokir deploy. Untuk menjadikannya
gerbang wajib, tambahkan `needs: verify` pada job `deploy`.

Deploy manual: **Actions → Deploy SAP AI Assistant → Run workflow**.

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