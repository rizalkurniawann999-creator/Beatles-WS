#!/usr/bin/env bash
# Quick tunnel: meneruskan http://localhost:PORT ke URL acak trycloudflare.com.
# Tidak butuh login. Cocok untuk demo/uji cepat.
# Pemakaian: npm run tunnel:quick   (atau: bash cloudflare/scripts/quick-tunnel.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./load-env.sh
source "${SCRIPT_DIR}/load-env.sh"

PORT="${PORT:-3000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "[x] cloudflared tidak ditemukan. Jalankan dulu: npm run cf:install" >&2
  exit 1
fi

echo "[i] Menyalakan quick tunnel ke http://localhost:${PORT}"
echo "[i] Pastikan server Beatles-WS sudah berjalan (npm start) di port ${PORT}."
echo "[i] Tekan Ctrl+C untuk menghentikan tunnel."
echo

exec cloudflared tunnel --url "http://localhost:${PORT}"
