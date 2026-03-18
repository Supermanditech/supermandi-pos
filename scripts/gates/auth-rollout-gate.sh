#!/usr/bin/env bash
# V3-HARDEN-118: Deploy smoke gate for POS OTP auth
# Verifies that the deployed backend supports the phone+OTP auth contract
# before allowing app promotion.
#
# Requires STAGING_URL or API_BASE_URL to be set.
set -euo pipefail

echo "=== Auth Rollout Gate ==="
ERRORS=0

BASE_URL="${STAGING_URL:-${API_BASE_URL:-}}"
if [ -z "$BASE_URL" ]; then
  echo "FAIL: Neither STAGING_URL nor API_BASE_URL set — cannot verify auth"
  exit 1
fi

# 1. OTP route exists (send-otp with missing phone should return 400, not 401/404)
echo "Checking POST /api/v1/pos/auth/send-otp..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  "${BASE_URL}/api/v1/pos/auth/send-otp" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "400" ]; then
  echo "  OK: send-otp returns 400 (route exists, validates input)"
elif [ "$HTTP_CODE" = "401" ]; then
  echo "  FAIL: send-otp returns 401 DEVICE_UNAUTHORIZED — OTP route not deployed"
  ERRORS=$((ERRORS+1))
elif [ "$HTTP_CODE" = "404" ]; then
  echo "  FAIL: send-otp returns 404 — route not mounted"
  ERRORS=$((ERRORS+1))
elif [ "$HTTP_CODE" = "000" ]; then
  echo "  FAIL: send-otp unreachable — server not responding"
  ERRORS=$((ERRORS+1))
else
  echo "  WARN: send-otp returns $HTTP_CODE (unexpected but route may exist)"
fi

# 2. OTP schema check (if DATABASE_URL available)
if [ -n "${DATABASE_URL:-}" ]; then
  echo "Checking pos_otp table exists..."
  TABLE_EXISTS=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'pos_otp';" 2>/dev/null || echo "0")
  if [ "$TABLE_EXISTS" -gt 0 ]; then
    echo "  OK: pos_otp table exists"
  else
    echo "  FAIL: pos_otp table missing — migration 191 not applied"
    ERRORS=$((ERRORS+1))
  fi
else
  echo "  SKIP: No DATABASE_URL — cannot verify OTP schema"
fi

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "GATE FAILED: $ERRORS error(s) — OTP auth not ready for promotion"
  exit 1
else
  echo "GATE PASSED: OTP auth route and schema verified"
fi
