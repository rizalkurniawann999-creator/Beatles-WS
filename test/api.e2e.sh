#!/usr/bin/env bash
# E2E API test untuk Beatles-WS.
# Cakupan: matriks RBAC (ADMIN/BOS/USER), kepemilikan broadcast, guard pairing.
# Jalankan: BASE=http://localhost:3000 bash test/api.e2e.sh
set -u

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0

ok()  { echo "  ok   $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL + 1)); }

expect_code() { # expect_code <actual> <expected> <label>
  if [ "$1" = "$2" ]; then ok "$3 ($1)"; else bad "$3 (expected $2 got $1)"; fi
}

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

json_field() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('$1',''))" 2>/dev/null; }

login() { # login <username> <password> -> token
  curl -s -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" | json_field token
}

register() { # register <name> <username> <password>
  curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$1\",\"username\":\"$2\",\"password\":\"$3\"}"
}

AUTH() { echo "Authorization: Bearer $1"; }

SUF=$RANDOM
USER_A="e2eua$SUF"
USER_B="e2eub$SUF"

echo "== Login & registrasi =="
ADMIN_TOKEN="$(login ws-beatles-admin ws-admin770088)"
BOS_TOKEN="$(login ws-beatles-boss ws-boss7002043)"
[ -n "$ADMIN_TOKEN" ] && ok "login ADMIN" || bad "login ADMIN"
[ -n "$BOS_TOKEN" ] && ok "login BOS" || bad "login BOS"

expect_code "$(register 'E2E User A' "$USER_A" rahasia123)" 201 "registrasi USER A"
expect_code "$(register 'E2E User B' "$USER_B" rahasia123)" 201 "registrasi USER B"
USER_A_TOKEN="$(login "$USER_A" rahasia123)"
USER_B_TOKEN="$(login "$USER_B" rahasia123)"
[ -n "$USER_A_TOKEN" ] && ok "login USER A" || bad "login USER A"
[ -n "$USER_B_TOKEN" ] && ok "login USER B" || bad "login USER B"

echo
echo "== Tanpa token harus 401 =="
expect_code "$(code "$BASE/api/users")" 401 "GET /users tanpa token"
expect_code "$(code "$BASE/api/dashboard")" 401 "GET /dashboard tanpa token"

echo
echo "== USER: endpoint admin/BOS harus 403 =="
for ep in users admin/databases admin/monitoring boss/analytics boss/audit \
          whatsapp/sessions whatsapp/status whatsapp/connect whatsapp/disconnect \
          whatsapp/logout whatsapp/pairing-code; do
  method=GET
  case "$ep" in
    whatsapp/connect|whatsapp/disconnect|whatsapp/logout|whatsapp/pairing-code) method=POST ;;
  esac
  expect_code "$(code -X "$method" "$BASE/api/$ep" -H "$(AUTH "$USER_A_TOKEN")" -H 'Content-Type: application/json' -d '{}')" \
    403 "USER $method /$ep"
done
expect_code "$(code -X POST "$BASE/api/admin/databases" -H "$(AUTH "$USER_A_TOKEN")")" 403 "USER POST /admin/databases"
expect_code "$(code -X POST "$BASE/api/templates" -H "$(AUTH "$USER_A_TOKEN")" -H 'Content-Type: application/json' -d '{"name":"x","content":"y"}')" 403 "USER POST /templates"
expect_code "$(code -X POST "$BASE/api/contacts" -H "$(AUTH "$USER_A_TOKEN")" -H 'Content-Type: application/json' -d '{"phone":"628123456789"}')" 403 "USER POST /contacts"

echo
echo "== USER: endpoint yang diizinkan =="
for ep in dashboard contacts templates messages withdrawals settings/tariff whatsapp/connected; do
  expect_code "$(code "$BASE/api/$ep" -H "$(AUTH "$USER_A_TOKEN")")" 200 "USER GET /$ep"
done

echo
echo "== ADMIN: endpoint admin harus 200 =="
for ep in users admin/databases admin/monitoring boss/analytics boss/audit whatsapp/sessions; do
  expect_code "$(code "$BASE/api/$ep" -H "$(AUTH "$ADMIN_TOKEN")")" 200 "ADMIN GET /$ep"
done
expect_code "$(code -X POST "$BASE/api/withdrawals" -H "$(AUTH "$ADMIN_TOKEN")" -H 'Content-Type: application/json' -d '{"amount":1000,"method":"x","destination":"y"}')" 403 "ADMIN POST /withdrawals (khusus USER)"

echo
echo "== BOS: batas akses =="
expect_code "$(code "$BASE/api/users" -H "$(AUTH "$BOS_TOKEN")")" 403 "BOS GET /users (khusus ADMIN)"
expect_code "$(code "$BASE/api/admin/databases" -H "$(AUTH "$BOS_TOKEN")")" 200 "BOS GET /admin/databases"
expect_code "$(code "$BASE/api/boss/analytics" -H "$(AUTH "$BOS_TOKEN")")" 200 "BOS GET /boss/analytics"

echo
echo "== Anti-Blast: ADMIN & BOS DILARANG kirim/blast (hanya USER) =="
for t in "$ADMIN_TOKEN" "$BOS_TOKEN"; do
  expect_code "$(code -X POST "$BASE/api/send-message" -H "$(AUTH "$t")" -H 'Content-Type: application/json' -d '{"phone":"628111222333","message":"x"}')" 403 "send-message dilarang (role non-USER)"
  expect_code "$(code -X POST "$BASE/api/broadcast" -H "$(AUTH "$t")" -H 'Content-Type: application/json' -d '{"phones":["628111222333"],"message":"x"}')" 403 "broadcast dilarang (role non-USER)"
done

echo
echo "== Kepemilikan broadcast (USER tidak boleh lihat/batalkan milik orang lain) =="
BC_ID="$(curl -s -X POST "$BASE/api/broadcast" -H "$(AUTH "$USER_A_TOKEN")" -H 'Content-Type: application/json' \
  -d '{"phones":["628111222333"],"message":"halo e2e","speed":"safe"}' | json_field broadcastId)"
[ -n "$BC_ID" ] && ok "USER A membuat broadcast" || bad "USER A membuat broadcast"
expect_code "$(code "$BASE/api/broadcast/$BC_ID" -H "$(AUTH "$USER_A_TOKEN")")" 200 "USER A lihat broadcast miliknya"
expect_code "$(code "$BASE/api/broadcast/$BC_ID" -H "$(AUTH "$USER_B_TOKEN")")" 403 "USER B lihat broadcast USER A"
expect_code "$(code -X POST "$BASE/api/broadcast/$BC_ID/cancel" -H "$(AUTH "$USER_B_TOKEN")")" 403 "USER B batalkan broadcast USER A"
expect_code "$(code "$BASE/api/broadcast/$BC_ID" -H "$(AUTH "$ADMIN_TOKEN")")" 200 "ADMIN lihat broadcast USER A"
expect_code "$(code -X POST "$BASE/api/broadcast/$BC_ID/cancel" -H "$(AUTH "$USER_A_TOKEN")")" 200 "USER A batalkan broadcast miliknya"

echo
echo "== Guard pairing =="
expect_code "$(code -X POST "$BASE/api/whatsapp/pairing-code" -H "$(AUTH "$ADMIN_TOKEN")" -H 'Content-Type: application/json' -d '{}')" 400 "pairing tanpa nomor -> 400"
expect_code "$(code -X POST "$BASE/api/whatsapp/pairing-code" -H "$(AUTH "$ADMIN_TOKEN")" -H 'Content-Type: application/json' -d '{"phoneNumber":"081"}')" 400 "pairing nomor tidak valid -> 400"

echo
echo "== Token user yang dihapus/dinonaktifkan harus ditolak (revalidasi auth) =="
# ADMIN menonaktifkan USER B: token lama USER B tidak boleh lagi berlaku.
code -X PATCH "$BASE/api/users/$USER_B" -H "$(AUTH "$ADMIN_TOKEN")" -H 'Content-Type: application/json' \
  -d '{"active":false}' >/dev/null
expect_code "$(code "$BASE/api/auth/me" -H "$(AUTH "$USER_B_TOKEN")")" 401 "token USER B setelah dinonaktifkan"

echo
echo "RESULT: pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
