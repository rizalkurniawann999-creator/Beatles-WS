#!/usr/bin/env bash
# Deploy frontend statis (folder public/) ke Cloudflare Pages.
# Token diambil dari environment variable CLOUDFLARE_API_TOKEN.
# Pemakaian: CLOUDFLARE_API_TOKEN=xxx npm run deploy:pages
#
# CATATAN: Pages hanya menghosting file statis. REST API /api/* dan gateway
# Baileys TIDAK ikut ter-deploy di sini. Untuk aplikasi penuh, pakai
# Cloudflare Tunnel (npm run tunnel:start) ke server Node yang berjalan.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=./load-env.sh
source "${SCRIPT_DIR}/load-env.sh"

PROJECT_NAME="${CF_PAGES_PROJECT:-beatles-ws}"
BRANCH="${CF_PAGES_BRANCH:-main}"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  cat >&2 <<'EOF'
[x] CLOUDFLARE_API_TOKEN belum diset.

Buat API Token di: Cloudflare Dashboard -> My Profile -> API Tokens
(template "Edit Cloudflare Workers" / Custom token dengan izin
 Account:Cloudflare Pages:Edit).

Lalu jalankan:
  export CLOUDFLARE_API_TOKEN="<token-anda>"
  npm run deploy:pages
EOF
  exit 1
fi

echo "[i] Deploy folder public/ ke Cloudflare Pages project '${PROJECT_NAME}' (branch ${BRANCH})..."

npx --yes wrangler@latest pages deploy "${PROJECT_ROOT}/public" \
  --project-name "${PROJECT_NAME}" \
  --branch "${BRANCH}" \
  --commit-dirty=true

echo "[✓] Deploy Pages selesai."
