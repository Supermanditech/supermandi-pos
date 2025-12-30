#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
STORE_ID="${STORE_ID:-store-1}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
VPA_VALUE="${VPA_VALUE:-qa.supermandi@upi}"

if [[ -z "$BASE_URL" ]]; then
  echo "BASE_URL is required. Example: BASE_URL=http://34.14.150.183:3001"
  exit 1
fi

tmp_body() {
  mktemp 2>/dev/null || echo "/tmp/supermandi_admin_smoke.$$"
}

request() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local token="${4:-}"

  local body
  body="$(tmp_body)"

  if [[ -n "$data" ]]; then
    if [[ -n "$token" ]]; then
      status=$(curl -s -o "$body" -w "%{http_code}" -X "$method" -H "Content-Type: application/json" -H "x-admin-token: ${token}" -d "$data" "$url")
    else
      status=$(curl -s -o "$body" -w "%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
    fi
  else
    if [[ -n "$token" ]]; then
      status=$(curl -s -o "$body" -w "%{http_code}" -X "$method" -H "x-admin-token: ${token}" "$url")
    else
      status=$(curl -s -o "$body" -w "%{http_code}" -X "$method" "$url")
    fi
  fi

  echo "$status|$body"
}

check_status() {
  local label="$1"
  local expected="$2"
  local status="$3"
  local body="$4"

  if [[ "$status" != "$expected" ]]; then
    echo "FAIL: $label (expected $expected, got $status)"
    cat "$body"
    exit 1
  fi
  echo "OK: $label"
}

check_body_contains() {
  local label="$1"
  local body="$2"
  local needle="$3"
  if ! grep -q "$needle" "$body"; then
    echo "FAIL: $label (missing $needle)"
    cat "$body"
    exit 1
  fi
}

echo "== Supermandi Admin Smoke Test =="
echo "Base: $BASE_URL"
echo "Store: $STORE_ID"

if [[ "${EXPECT_ADMIN_DISABLED:-}" == "1" ]]; then
  echo "-- Checking admin_disabled when ADMIN_TOKEN missing on server"
  resp=$(request GET "$BASE_URL/api/v1/admin/stores/$STORE_ID")
  status="${resp%%|*}"
  body="${resp#*|}"
  check_status "admin_disabled" "503" "$status" "$body"
  check_body_contains "admin_disabled body" "$body" "admin_disabled"
else
  echo "-- Skipping admin_disabled check (set EXPECT_ADMIN_DISABLED=1 and unset ADMIN_TOKEN on VM to validate)."
fi

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ADMIN_TOKEN is required for activation tests."
  exit 1
fi

echo "-- Activating store (set VPA)"
resp=$(request PATCH "$BASE_URL/api/v1/admin/stores/$STORE_ID" "{\"upiVpa\":\"$VPA_VALUE\"}" "$ADMIN_TOKEN")
status="${resp%%|*}"
body="${resp#*|}"
check_status "activate store" "200" "$status" "$body"
check_body_contains "active true" "$body" "\"active\":true"

echo "-- Deactivating store (clear VPA)"
resp=$(request PATCH "$BASE_URL/api/v1/admin/stores/$STORE_ID" "{\"upiVpa\":\"\"}" "$ADMIN_TOKEN")
status="${resp%%|*}"
body="${resp#*|}"
check_status "deactivate store" "200" "$status" "$body"
check_body_contains "active false" "$body" "\"active\":false"

echo "-- POS endpoints should return store_inactive"
resp=$(request POST "$BASE_URL/api/v1/pos/scan/resolve" "{\"scanValue\":\"1234567890\",\"mode\":\"SELL\",\"storeId\":\"$STORE_ID\"}")
status="${resp%%|*}"
body="${resp#*|}"
check_status "scan resolve inactive" "403" "$status" "$body"
check_body_contains "scan resolve inactive body" "$body" "store_inactive"

resp=$(request GET "$BASE_URL/api/v1/pos/stores/$STORE_ID/status")
status="${resp%%|*}"
body="${resp#*|}"
check_status "store status inactive" "403" "$status" "$body"
check_body_contains "store status inactive body" "$body" "store_inactive"

resp=$(request POST "$BASE_URL/api/v1/pos/events" "{\"deviceId\":\"smoke-test\",\"storeId\":\"$STORE_ID\",\"eventType\":\"SMOKE\",\"payload\":{}}")
status="${resp%%|*}"
body="${resp#*|}"
check_status "events inactive" "403" "$status" "$body"
check_body_contains "events inactive body" "$body" "store_inactive"

echo "All checks passed."
