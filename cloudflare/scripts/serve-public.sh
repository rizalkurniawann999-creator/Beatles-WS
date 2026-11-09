#!/usr/bin/env bash
# Nyalakan server Beatles-WS + quick tunnel publik (trycloudflare.com) sekaligus.
# URL publik gratis, tapi BERUBAH setiap kali skrip dijalankan.
# Pemakaian: npm run serve:public

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=./load-env.sh
source "${SCRIPT_DIR}/load-env.sh"

PORT="${PORT:-3000}"
LOG_DIR="${PROJECT_ROOT}/.cloudflared"
mkdir -p "$LOG_DIR"
SERVER_LOG="${LOG_DIR}/server.log"
TUNNEL_LOG="${LOG_DIR}/tunnel.log"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "[x] cloudflared tidak ditemukan. Jalankan dulu: npm run cf:install" >&2
  exit 1
fi

CLEANED=0
cleanup() {
  [ "$CLEANED" -eq 1 ] && return
  CLEANED=1
  echo
  echo "[i] Menghentikan server & tunnel..."
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "[i] Menjalankan server (port ${PORT})..."
node "${PROJECT_ROOT}/src/server.js" > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# Tunggu server siap (percobaan pertama memang bisa gagal sebelum server up).
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "http://localhost:${PORT}/api/health" 2>/dev/null; then break; fi
  sleep 0.5
done

if ! curl -fsS -o /dev/null "http://localhost:${PORT}/api/health" 2>/dev/null; then
  echo "[x] Server gagal start. Lihat log: ${SERVER_LOG}" >&2
  exit 1
fi
echo "[✓] Server siap di http://localhost:${PORT}"

echo "[i] Menyalakan quick tunnel..."
cloudflared tunnel --url "http://localhost:${PORT}" > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

URL=""
for _ in $(seq 1 40); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "[x] Gagal mendapatkan URL tunnel. Lihat log: ${TUNNEL_LOG}" >&2
  exit 1
fi

printf '%s\n' "$URL" > "${LOG_DIR}/url.txt"
cat <<EOF

============================================================
  ✅  Beatles-WS ONLINE (tunnel gratis Cloudflare)
============================================================
  URL publik : ${URL}
  Lokal      : http://localhost:${PORT}
  Log server : ${SERVER_LOG}
  Log tunnel : ${TUNNEL_LOG}

  Catatan: URL ini BERUBAH setiap kali dijalankan.
  Tekan Ctrl+C untuk menghentikan server + tunnel.
============================================================
EOF

# Jaga skrip tetap hidup sampai Ctrl+C.
wait "$SERVER_PID"
