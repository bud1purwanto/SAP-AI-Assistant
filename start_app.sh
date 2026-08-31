#!/usr/bin/env bash

# ==============================================================================
# SAP AI Assistant - Linux Launcher Script
# Menjalankan Backend (FastAPI) dan Frontend (Vite) secara bersamaan.
# Siap untuk pengujian via Localhost maupun IP Address (LAN / Wi-Fi / VPN).
# Tekan Ctrl+C untuk menghentikan kedua service secara rapi.
# ==============================================================================

# Pastikan script berjalan dari root direktori proyek
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Warna terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================================${NC}"
echo -e "${BLUE}        Starting SAP AI Assistant (Dev Mode)         ${NC}"
echo -e "${BLUE}=====================================================${NC}"
echo ""

# 1. Deteksi IP Server untuk akses via jaringan / IP
LOCAL_IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$' | grep -v ':' | head -n 3)
PRIMARY_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || echo "$LOCAL_IPS" | head -n 1)
if [ -z "$PRIMARY_IP" ]; then
    PRIMARY_IP="127.0.0.1"
fi

# 2. Deteksi Python / Virtual Environment
PYTHON_BIN="python3"
if [ -f "$PROJECT_ROOT/backend/venv/bin/python" ]; then
    PYTHON_BIN="$PROJECT_ROOT/backend/venv/bin/python"
    echo -e "${GREEN}✓${NC} Menggunakan venv: backend/venv"
elif [ -f "$PROJECT_ROOT/.venv/bin/python" ]; then
    PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
    echo -e "${GREEN}✓${NC} Menggunakan venv: .venv"
elif [ -f "$PROJECT_ROOT/venv/bin/python" ]; then
    PYTHON_BIN="$PROJECT_ROOT/venv/bin/python"
    echo -e "${GREEN}✓${NC} Menggunakan venv: venv"
elif command -v python3 &>/dev/null; then
    PYTHON_BIN="python3"
    echo -e "${YELLOW}!${NC} Virtual environment tidak ditemukan, menggunakan python3 sistem"
elif command -v python &>/dev/null; then
    PYTHON_BIN="python"
    echo -e "${YELLOW}!${NC} Virtual environment tidak ditemukan, menggunakan python sistem"
else
    echo -e "${RED}✗ Error: Python tidak ditemukan di sistem!${NC}"
    exit 1
fi

# Cek file .env backend
if [ ! -f "$PROJECT_ROOT/backend/.env" ]; then
    echo -e "${YELLOW}! Peringatan: backend/.env tidak ditemukan.${NC}"
    if [ -f "$PROJECT_ROOT/backend/.env.example" ]; then
        echo -e "  Disarankan salin dari: ${YELLOW}cp backend/.env.example backend/.env${NC}"
    fi
fi

# 3. Cari Port yang Tersedia untuk Backend (Default: 8006 untuk menghindari konflik port 8000)
BACKEND_PORT="${BACKEND_PORT:-8006}"
is_port_in_use() {
    ss -tulpn 2>/dev/null | grep -q ":$1 "
}

while is_port_in_use "$BACKEND_PORT"; do
    echo -e "${YELLOW}! Port $BACKEND_PORT sedang digunakan oleh aplikasi lain, mencoba port $((BACKEND_PORT + 1))...${NC}"
    BACKEND_PORT=$((BACKEND_PORT + 1))
done

# 4. Fungsi Cleanup saat script dihentikan (Ctrl+C)
cleanup() {
    echo ""
    echo -e "${YELLOW}Menghentikan semua service...${NC}"
    if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null
    fi
    if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null
    fi
    wait 2>/dev/null
    echo -e "${GREEN}✓ Semua service berhasil dihentikan.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 5. Jalankan Backend Server (Host 0.0.0.0 agar bisa diakses dari IP)
echo ""
echo -e "${BLUE}[1/2] Menjalankan Backend Server (Port $BACKEND_PORT)...${NC}"
(
    cd "$PROJECT_ROOT/backend" || exit 1
    exec "$PYTHON_BIN" -m uvicorn main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

# 6. Jalankan Frontend Server (Host 0.0.0.0 agar bisa diakses dari IP)
echo -e "${BLUE}[2/2] Menjalankan Frontend Server (Port 5173)...${NC}"
if ! command -v npm &>/dev/null; then
    echo -e "${RED}✗ Error: npm / Node.js tidak ditemukan di sistem!${NC}"
    cleanup
    exit 1
fi

# Pastikan binary vite dan dependensi di node_modules memiliki izin eksekusi
if [ -d "$PROJECT_ROOT/frontend/node_modules/.bin" ]; then
    chmod +x "$PROJECT_ROOT/frontend/node_modules/.bin/"* 2>/dev/null
fi

(
    cd "$PROJECT_ROOT/frontend" || exit 1
    VITE_BACKEND_PORT="$BACKEND_PORT" exec npm run dev -- --host 0.0.0.0 --port 5173
) &
FRONTEND_PID=$!

# Tampilkan URL Akses
echo ""
echo -e "${GREEN}=====================================================${NC}"
echo -e "${BOLD}Aplikasi siap diakses:${NC}"
echo ""
echo -e "  ${BOLD}💻 Akses Lokal (Mesin ini):${NC}"
echo -e "     - Frontend : ${CYAN}http://localhost:5173${NC}"
echo -e "     - Backend  : ${CYAN}http://localhost:${BACKEND_PORT}${NC}"
echo ""
echo -e "  ${BOLD}🌐 Akses Jaringan / IP (Device lain di LAN/Wi-Fi):${NC}"
for ip in $LOCAL_IPS; do
    echo -e "     - Frontend : ${GREEN}http://${ip}:5173${NC}"
    echo -e "     - Backend  : ${CYAN}http://${ip}:${BACKEND_PORT}${NC}"
done
echo ""
echo -e "Tekan ${YELLOW}[Ctrl + C]${NC} di terminal ini untuk mematikan kedua service."
echo -e "${GREEN}=====================================================${NC}"
echo ""

# Tunggu proses background tetap berjalan
wait
