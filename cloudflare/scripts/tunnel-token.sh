#!/usr/bin/env bash
# Named tunnel via token (produksi). Token diambil dari environment variable
# CLOUDFLARE_TUNNEL_TOKEN. Tidak menyimpan token ke disk.
# Pemakaian: CLOUDFLARE_TUNNEL_TOKEN=xxx npm run tunnel:start
#        atau: bash cloudflare/scripts/tunnel-token.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./load-env.sh
source "${SCRIPT_DIR}/load-env.sh"

TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "[x] cloudflared tidak ditemukan. Jalankan dulu: npm run cf:install" >&2
  exit 1
fi

if [ -z "$TOKEN" ]; then
  cat >&2 <<'EOF'
[x] CLOUDFLARE_TUNNEL_TOKEN belum diset.

Cara mengambil token:
  1. Buka dashboard Cloudflare -> Zero Trust -> Networks -> Tunnels
  2. Pilih (atau buat) tunnel, klik "Configure" / "Install connector"
  3. Salin token yang diberikan (string panjang)

Lalu jalankan:
  export CLOUDFLARE_TUNNEL_TOKEN="<token-anda>"
  npm run tunnel:start
EOF
  exit 1
fi

echo "[i] Menjalankan named tunnel dengan token dari environment (tidak ditulis ke disk)."
exec cloudflared tunnel run --token "$TOKEN"
