#!/usr/bin/env bash
# Install cloudflared (CLI resmi Cloudflare) secara idempoten.
# Pemakaian: npm run cf:install   (atau: bash cloudflare/scripts/install-cloudflared.sh)

set -euo pipefail

if command -v cloudflared >/dev/null 2>&1; then
  echo "[✓] cloudflared sudah terpasang: $(cloudflared --version)"
  exit 0
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) DEB_ARCH="amd64" ;;
  aarch64|arm64) DEB_ARCH="arm64" ;;
  *)
    echo "[x] Arsitektur tidak didukung oleh paket .deb: $ARCH" >&2
    echo "    Unduh manual dari: https://github.com/cloudflare/cloudflared/releases" >&2
    exit 1
    ;;
esac

URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${DEB_ARCH}.deb"
TMP_DEB="$(mktemp --suffix=.deb)"

echo "[i] Mengunduh cloudflared (${DEB_ARCH}) dari rilis resmi Cloudflare..."
curl -fsSL -o "$TMP_DEB" "$URL"

echo "[i] Memasang paket..."
if [ "$(id -u)" -eq 0 ]; then
  dpkg -i "$TMP_DEB"
else
  sudo dpkg -i "$TMP_DEB"
fi

rm -f "$TMP_DEB"
echo "[✓] Selesai: $(cloudflared --version)"
