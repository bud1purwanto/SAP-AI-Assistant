# 🚀 Panduan Deployment SAP AI Assistant via Docker (Production)
# 🚀 Panduan Deployment Enterprise AI Assistant via Docker (Production)

Dokumen ini berisi panduan komprehensif langkah demi langkah untuk men-deploy **SAP AI Assistant (FastAPI + React + MCP Gateway + PostgreSQL)** ke server Linux menggunakan arsitektur **Docker Container**.
Dokumen ini berisi panduan komprehensif langkah demi langkah untuk men-deploy **Enterprise AI Assistant (FastAPI + React + MCP Gateway + PostgreSQL)** ke server Linux menggunakan arsitektur **Docker Container**.

Deploy sekarang sudah **sepenuhnya otomatis** tanpa downtime, memanfaatkan Docker dan GitHub Actions.

---

## ⚡ Metode 1: GitHub Actions CI/CD (Rekomendasi)

Setiap push atau merge ke branch `main`, GitHub Actions akan otomatis:
1. Menarik kode terbaru ke server produksi (`/var/www/SAP-AI-Assistant`).
1. Menarik kode terbaru ke server produksi (`/var/www/Enterprise-AI-Assistant` atau `/var/www/SAP-AI-Assistant`).
2. Melakukan build Frontend React dan Nginx.
3. Melakukan build Backend Python FastAPI.
4. Me-restart container Docker dengan zero-downtime.

Skrip workflow ini berada di `.github/workflows/deploy.yml`. 
Pastikan server memiliki runner GitHub Actions yang aktif dan ter-tag `self-hosted`.

---

## ⚡ Metode 2: Deploy Manual dengan Docker Compose
## ⚡ Metode 2: Deploy Manual dengan Docker Compose (Paling Praktis)

Jika Anda ingin melakukan build dan restart secara manual di server produksi, gunakan perintah Docker Compose.
Jika Anda ingin melakukan build dan restart secara manual di server produksi menggunakan `docker-compose`:

### 1. Masuk ke folder Production
```bash
cd /var/www/SAP-AI-Assistant
cd /var/www/Enterprise-AI-Assistant
# atau: cd /var/www/SAP-AI-Assistant
```

### 2. Update Source Code
```bash
git fetch origin main
git reset --hard FETCH_HEAD
```

### 3. Build & Restart Container (Zero Downtime)
### 3. Build & Jalankan Seluruh Container Stack
```bash
# Build Frontend terlebih dahulu (butuh dependencies Node.js)
# Build Frontend terlebih dahulu
cd frontend && npm ci && npm run build && cd ..

# Hapus container lama dan jalankan container baru
sudo docker rm -f sap-ai-frontend sap-ai-backend
# Jalankan stack Docker Compose
docker compose up -d --build
```

sudo docker build -t sap-ai-backend-img:latest -f Dockerfile.backend .
sudo docker build -t sap-ai-frontend-img:latest -f Dockerfile.frontend .
---

## ⚡ Metode 3: Deploy Manual dengan Docker CLI

Jika Anda ingin menjalankan container secara individual via Docker CLI:

```bash
# 1. Build frontend terlebih dahulu
cd frontend && npm ci && npm run build && cd ..

# 2. Buat network jika belum ada
sudo docker network create enterprise-ai-net 2>/dev/null || true

# 3. Hapus container lama
sudo docker rm -f enterprise-ai-frontend enterprise-ai-backend 2>/dev/null || true

# 4. Build image
sudo docker build -t enterprise-ai-backend-img:latest -f Dockerfile.backend .
sudo docker build -t enterprise-ai-frontend-img:latest -f Dockerfile.frontend .

# 5. Jalankan backend container
sudo docker run -d \
  --name sap-ai-backend \
  --name enterprise-ai-backend \
  --network enterprise-ai-net \
  --network-alias backend \
  --restart=unless-stopped \
  -p 8006:8005 \
  --env-file backend/.env \
  -v /var/www/SAP-AI-Assistant/backend:/app \
  sap-ai-backend-img:latest
  -v "$(pwd)/backend:/app:ro" \
  enterprise-ai-backend-img:latest

# 6. Jalankan frontend container
sudo docker run -d \
  --name sap-ai-frontend \
  --name enterprise-ai-frontend \
  --network enterprise-ai-net \
  --restart=unless-stopped \
  -p 8086:80 \
  --link sap-ai-backend:backend \
  sap-ai-frontend-img:latest
  enterprise-ai-frontend-img:latest
```

---

## 📊 Manajemen Container & Monitoring

### Cek Status Aplikasi
```bash
sudo docker ps | grep sap-ai
sudo docker ps --filter "name=enterprise-ai"
```

### Cek Log Backend (FastAPI)
```bash
sudo docker logs -f sap-ai-backend
sudo docker logs -f enterprise-ai-backend
```

### Cek Log Frontend (Nginx)
```bash
sudo docker logs -f sap-ai-frontend
sudo docker logs -f enterprise-ai-frontend
```

---

## ⚙️ Konfigurasi Environment Variable (.env)

Pengaturan token API dan database harus di-setel di dalam `/var/www/SAP-AI-Assistant/backend/.env`. Docker akan otomatis memuat file ini.
Pengaturan token API dan database harus di-setel di dalam `backend/.env`. Docker akan otomatis memuat file ini.

#### Variabel Wajib:
| Variabel | Kegunaan |
|----------|----------|
| `OPENROUTER_API_KEY` | (Wajib) API key untuk koneksi ke model AI. |
| `DATABASE_URL` | (Wajib) Koneksi PostgreSQL (contoh: `postgresql+psycopg://user:pass@192.168.1.1:5432/DB`). |
| `DATABASE_URL` | (Wajib) Koneksi PostgreSQL (contoh: `postgresql+psycopg://postgres:postgres@enterprise-ai-postgres:5432/ABAP_DB` atau host PostgreSQL). |
| `MCP_SAP_TYPE` | Pilih `sse` untuk akses gateway MCP. |

Jika Anda mengubah file `.env`, container backend harus direstart:
```bash
sudo docker restart sap-ai-backend
sudo docker restart enterprise-ai-backend
```

---

## 🌐 Konfigurasi Cloudflare Tunnel

Traffic dialihkan menggunakan Cloudflare Tunnel yang membaca dari Host server di port Docker.
Traffic dialihkan menggunakan Cloudflare Tunnel yang membaca dari Host server di port Docker frontend (`8086`).

Edit konfigurasi `/etc/cloudflared/config.yml` dan ubah routing `ai.abap.web.id` menjadi:
Edit konfigurasi `/etc/cloudflared/config.yml` dan pastikan routing hostname mengarah ke port frontend:
```yaml
  - hostname: ai.abap.web.id
    service: http://127.0.0.1:8086
```
Restart tunnel: `sudo docker restart cloudflared`.
Restart tunnel: `sudo docker restart cloudflared` atau `sudo systemctl restart cloudflared`.
