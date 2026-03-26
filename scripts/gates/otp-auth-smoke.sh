#!/usr/bin/env bash
# =============================================================================
# V3-GCP-007: OTP Auth Smoke Tests (CD Gate — Post-Deploy)
# Validates: send-otp, verify-otp, ui-status endpoints are reachable
# and return expected response shapes through the gateway.
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0

STAGING_URL="${STAGING_URL:-https://staging.supermandi.tech}"

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2"; }

echo "=== V3-GCP-007: OTP Auth Smoke Tests ==="
echo "Target: $STAGING_URL"
echo ""

# Test 1: send-otp returns 400 for missing phone (endpoint reachable)
echo "--- Test 1: POST /api/v1/auth/pos/auth/send-otp (missing phone) ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$STAGING_URL/api/v1/auth/pos/auth/send-otp" \
  -H "Content-Type: application/json" \
  -d '{}' \
  --connect-timeout 10 --max-time 15)
if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "401" ]; then
  gate_pass "send-otp returns $HTTP_CODE (endpoint reachable, auth enforced)"
else
  gate_fail "send-otp expected 400/401, got $HTTP_CODE" "endpoint may not be deployed"
fi

# Test 2: verify-otp returns 400 or 401 for missing input
echo "--- Test 2: POST /api/v1/auth/pos/auth/verify-otp (missing input) ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$STAGING_URL/api/v1/auth/pos/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{}' \
  --connect-timeout 10 --max-time 15)
if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "401" ]; then
  gate_pass "verify-otp returns $HTTP_CODE (endpoint reachable, auth enforced)"
else
  gate_fail "verify-otp expected 400/401, got $HTTP_CODE" "endpoint may not be deployed"
fi

# Test 3: ui-status returns 401 without device token
echo "--- Test 3: GET /api/v1/pos/ui-status (no token) ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X GET "$STAGING_URL/api/v1/pos/ui-status" \
  --connect-timeout 10 --max-time 15)
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  gate_pass "ui-status returns 401/403 without token"
else
  gate_fail "ui-status expected 401/403, got $HTTP_CODE" "middleware may not be enforcing auth"
fi

# Test 4: Migration 191 (pos_otp table) applied — checked via send-otp not returning 500
echo "--- Test 4: send-otp does not 500 (migration 191 applied) ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$STAGING_URL/api/v1/auth/pos/auth/send-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone":"0000000000"}' \
  --connect-timeout 10 --max-time 15)
if [ "$HTTP_CODE" != "500" ]; then
  gate_pass "send-otp does not 500 (DB tables exist)"
else
  gate_fail "send-otp returned 500" "migration 191 may not be applied"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  echo "DEPLOYMENT BLOCKED — fix failing gates before promoting"
  exit 1
fi
echo "All OTP auth smoke tests passed."
