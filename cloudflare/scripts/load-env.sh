#!/usr/bin/env bash
# Helper: memuat variabel dari file .env proyek (tanpa menimpa env yang sudah ada).
# Dipakai oleh skrip Cloudflare lain. Aman: tidak mencetak nilai rahasia.

set -u

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # Lewati komentar dan baris kosong.
    case "$line" in
      ''|\#*) continue ;;
    esac

    key="${line%%=*}"
    value="${line#*=}"

    # Buang spasi di sekitar key.
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [ -n "$key" ] || continue

    # Jangan timpa variabel yang sudah diset di environment.
    if [ -z "${!key:-}" ]; then
      export "$key=$value"
    fi
  done < "$ENV_FILE"
fi
