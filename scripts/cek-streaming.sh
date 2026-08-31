#!/usr/bin/env bash
#
# Memastikan di titik mana aliran jawaban (SSE) berhenti mengalir.
#
# Jawaban yang tidak muncul kata demi kata dapat disebabkan tiga hal, dan
# ketiganya perlu penanganan berbeda:
#
#   1. Model/provider tidak mengalirkan  -> seluruh teks datang sebagai satu event
#   2. Nginx menahan (buffering)         -> backend mengalir, lewat Nginx tidak
#   3. Sisi browser                      -> keduanya mengalir, layar tetap diam
#
# Skrip ini menandai waktu tiap event yang tiba, sehingga ketiganya dapat
# dibedakan tanpa menebak. Jalankan DI SERVER.
#
#   bash scripts/cek-streaming.sh <username> <password>
set -uo pipefail

USER_NAME="${1:-}"
PASSWORD="${2:-}"
BACKEND="${BACKEND_URL:-http://127.0.0.1:8005}"
NGINX="${NGINX_URL:-http://127.0.0.1:8080}"
PERTANYAAN="${PERTANYAAN:-Jelaskan secara singkat perbedaan tabel MARA, MARC, dan MARD}"

if [ -z "$USER_NAME" ] || [ -z "$PASSWORD" ]; then
    echo "Pemakaian: bash scripts/cek-streaming.sh <username> <password>" >&2
    exit 1
fi

uji() {
    local nama="$1" base="$2"
    echo ""
    echo "=================================================="
    echo "  $nama  ($base)"
    echo "=================================================="

    local token
    token=$(curl -s --max-time 15 -X POST "$base/api/login" \
        -H 'Content-Type: application/json' \
        -d "{\"username\":\"$USER_NAME\",\"password\":\"$PASSWORD\"}" \
        | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

    if [ -z "$token" ]; then
        echo "❌ Login gagal — periksa username/password, atau $base tidak dapat dihubungi."
        return 1
    fi

    local mulai_ns
    mulai_ns=$(date +%s%N)

    local token_ke=0 progress_ke=0 pertama_ms=0 terakhir_ms=0 result_ms=0 baris

    # Pengukuran memakai `while read` bawaan bash, BUKAN awk/sed.
    # awk membaca stdin dari pipe dalam blok ±4KB, sehingga baris-baris SSE yang
    # kecil menumpuk dulu di dalam buffernya. Yang terukur menjadi buffering
    # skrip ini sendiri, bukan buffering server — dan hasilnya menuduh Nginx
    # menahan aliran padahal tidak. `curl -N` mematikan buffering di sisi curl.
    while IFS= read -r baris; do
        case "$baris" in
            "data: "*) ;;
            *) continue ;;
        esac

        local sekarang_ms=$(( ($(date +%s%N) - mulai_ns) / 1000000 ))

        case "$baris" in
            *'"type": "token"'*|*'"type":"token"'*)
                token_ke=$(( token_ke + 1 ))
                [ "$pertama_ms" -eq 0 ] && pertama_ms=$sekarang_ms
                terakhir_ms=$sekarang_ms
                ;;
            *progress*)   progress_ke=$(( progress_ke + 1 )) ;;
            *'"result"'*) result_ms=$sekarang_ms ;;
        esac
    done < <(curl -sN --max-time 180 -X POST "$base/api/chat/stream" \
        -H "Authorization: Bearer $token" \
        -H 'Content-Type: application/json' \
        -d "{\"message\":\"$PERTANYAAN\"}")

    local rentang_ms=$(( terakhir_ms - pertama_ms ))

    echo "  event token    : $token_ke"
    echo "  event progress : $progress_ke"
    if [ "$token_ke" -gt 0 ]; then
        echo "  token pertama  : $(( pertama_ms / 1000 )).$(printf '%03d' $(( pertama_ms % 1000 ))) detik"
        echo "  token terakhir : $(( terakhir_ms / 1000 )).$(printf '%03d' $(( terakhir_ms % 1000 ))) detik"
        echo "  rentang aliran : $(( rentang_ms / 1000 )).$(printf '%03d' $(( rentang_ms % 1000 ))) detik"
    fi
    echo "  jawaban selesai: $(( result_ms / 1000 )).$(printf '%03d' $(( result_ms % 1000 ))) detik"
    echo ""

    if [ "$token_ke" -eq 0 ]; then
        echo "  -> TIDAK ADA event token sama sekali."
        echo "     Model/provider tidak mengalirkan jawabannya."
    elif [ "$rentang_ms" -lt 500 ]; then
        echo "  -> Semua token tiba hampir bersamaan (rentang < 0,5 detik)."
        echo "     Ada yang menahan aliran, bukan mengalirkannya."
    else
        echo "  -> Aliran BEKERJA di titik ini."
    fi
}

uji "LANGSUNG KE BACKEND" "$BACKEND"
uji "LEWAT NGINX" "$NGINX"

cat <<'CATATAN'

==================================================
  CARA MEMBACA HASILNYA
==================================================
  Backend mengalir, Nginx tidak
      -> Nginx menahan aliran. Terapkan ulang konfigurasinya:
         sudo cp deploy/nginx-sap-ai.conf /etc/nginx/sites-available/sap-ai
         sudo nginx -t && sudo systemctl reload nginx

  Backend sendiri tidak mengalir
      -> Provider AI tidak mendukung streaming untuk model yang dipakai.
         Coba ganti model di Admin Dashboard > MCP & AI Provider.

  Keduanya mengalir, tetapi layar tetap diam
      -> Masalah di sisi browser; kemungkinan besar service worker PWA masih
         menyajikan versi lama. Tutup semua tab/aplikasi lalu buka kembali.
CATATAN
