#!/usr/bin/env bash
# Penjaga (watchdog): pastikan server + quick tunnel selalu hidup.
#
# Berguna di lingkungan yang proses latarnya bisa mati (mis. sandbox yang
# di-reset). Skrip memantau kedua proses dan menyalakannya kembali bila mati,
# lalu menulis URL tunnel terbaru ke .cloudflared/url.txt.
#
# Pemakaian: npm run watchdog   (hentikan dengan Ctrl+C)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=./load-env.sh
source "${SCRIPT_DIR}/load-env.sh"

PORT="${PORT:-3000}"
INTERVAL="${WATCHDOG_INTERVAL:-5}"
LOG_DIR="${PROJECT_ROOT}/.cloudflared"
mkdir -p "$LOG_DIR"
SERVER_LOG="${LOG_DIR}/server.log"
TUNNEL_LOG="${LOG_DIR}/tunnel.log"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "[x] cloudflared tidak ditemukan. Jalankan dulu: npm run cf:install" >&2
  exit 1
fi

SERVER_PID=""
TUNNEL_PID=""
URL=""

stop_all() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  wait 2>/dev/null
}
trap 'echo; echo "[i] Watchdog berhenti."; stop_all; exit 0' INT TERM

is_alive() {
  [ -n "$1" ] && kill -0 "$1" 2>/dev/null
}

start_server() {
  node "${PROJECT_ROOT}/src/server.js" > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  echo "[i] Server dinyalakan (pid ${SERVER_PID})"
}

start_tunnel() {
  : > "$TUNNEL_LOG"
  cloudflared tunnel --url "http://localhost:${PORT}" > "$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  echo "[i] Tunnel dinyalakan (pid ${TUNNEL_PID}), menunggu URL..."

  local found=""
  for _ in $(seq 1 60); do
    found="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
    [ -n "$found" ] && break
    sleep 0.5
  done

  if [ -z "$found" ]; then
    echo "[x] Gagal mendapatkan URL tunnel, akan dicoba lagi." >&2
    return 1
  fi

  URL="$found"
  printf '%s\n' "$URL" > "${LOG_DIR}/url.txt"
  echo "[✓] URL publik: ${URL}"
}

echo "[i] Watchdog aktif (interval ${INTERVAL}s). Tekan Ctrl+C untuk berhenti."
start_server
sleep 1
start_tunnel || true

while true; do
  sleep "$INTERVAL"

  if ! is_alive "$SERVER_PID"; then
    echo "[!] Server mati, menyalakan ulang..."
    start_server
    sleep 1
  fi

  if ! is_alive "$TUNNEL_PID"; then
    echo "[!] Tunnel mati, menyalakan ulang..."
    start_tunnel || true
  fi

  # Server hidup tapi belum bisa diakses -> tunggu, jangan spam restart.
  if ! curl -fsS -o /dev/null "http://localhost:${PORT}/api/health" 2>/dev/null; then
    sleep 1
  fi
done
