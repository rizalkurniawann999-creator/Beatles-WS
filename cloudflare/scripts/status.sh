#!/usr/bin/env bash
# Cek status autentikasi & kesiapan Cloudflare tanpa membocorkan token.
# Pemakaian: npm run cf:status

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./load-env.sh
source "${SCRIPT_DIR}/load-env.sh"

echo "=== Cloudflare Readiness Check ==="
echo

# 1. cloudflared
if command -v cloudflared >/dev/null 2>&1; then
  echo "[✓] cloudflared : $(cloudflared --version)"
else
  echo "[x] cloudflared : TIDAK terpasang (jalankan: npm run cf:install)"
fi

# 2. Sertifikat login tunnel
CERT="${HOME}/.cloudflared/cert.pem"
if [ -f "$CERT" ]; then
  echo "[✓] cert.pem    : ada (${CERT}) -> sudah pernah 'cloudflared tunnel login'"
else
  echo "[ ] cert.pem    : belum ada (jalankan: cloudflared tunnel login)"
fi

# 3. Environment token (hanya status, bukan nilai)
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "[✓] CLOUDFLARE_API_TOKEN        : diset (panjang ${#CLOUDFLARE_API_TOKEN})"
else
  echo "[ ] CLOUDFLARE_API_TOKEN        : belum diset"
fi

if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo "[✓] CLOUDFLARE_TUNNEL_TOKEN     : diset (panjang ${#CLOUDFLARE_TUNNEL_TOKEN})"
else
  echo "[ ] CLOUDFLARE_TUNNEL_TOKEN     : belum diset"
fi

# 4. Named tunnels yang tersimpan lokal
TUNNEL_DIR="${HOME}/.cloudflared"
if [ -d "$TUNNEL_DIR" ] && ls "$TUNNEL_DIR"/*.json >/dev/null 2>&1; then
  echo "[i] Tunnel lokal terdeteksi:"
  for f in "$TUNNEL_DIR"/*.json; do
    printf '      - %s\n' "$(basename "$f")"
  done
else
  echo "[ ] Belum ada named tunnel lokal (jalankan: cloudflared tunnel create beatles-ws)"
fi

echo
echo "Langkah berikutnya lihat: cloudflare/README.md"
