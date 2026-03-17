#!/usr/bin/env bash
# V3-HARDEN-062: SELL-home gateway parity smoke tests
set -euo pipefail
PASS=0; FAIL=0
STAGING_URL="${STAGING_URL:-https://staging.supermandi.tech}"
gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2"; }

echo "=== V3-HARDEN-062: SELL Home Gateway Parity ==="
echo "Target: $STAGING_URL"

# Test 1: ui-status reachable (401 without token = endpoint exists)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/api/v1/pos/ui-status" --connect-timeout 10 --max-time 15)
[ "$HTTP" = "401" ] || [ "$HTTP" = "403" ] && gate_pass "ui-status reachable ($HTTP)" || gate_fail "ui-status got $HTTP" "expected 401/403"

# Test 2: frequent products endpoint reachable (401 = exists)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/api/v1/pos/products/frequent" --connect-timeout 10 --max-time 15)
[ "$HTTP" = "401" ] || [ "$HTTP" = "403" ] && gate_pass "frequent-products reachable ($HTTP)" || gate_fail "frequent-products got $HTTP" "expected 401/403"

# Test 3: store-products list endpoint reachable
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/api/v1/pos/store-products/list" --connect-timeout 10 --max-time 15)
[ "$HTTP" = "401" ] || [ "$HTTP" = "403" ] && gate_pass "store-products list reachable ($HTTP)" || gate_fail "store-products got $HTTP" "expected 401/403"

# Test 4: SSE sync events endpoint reachable
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/api/v1/pos/sync/events" --connect-timeout 10 --max-time 15)
[ "$HTTP" = "401" ] || [ "$HTTP" = "403" ] && gate_pass "SSE sync/events reachable ($HTTP)" || gate_fail "sync/events got $HTTP" "expected 401/403"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -gt 0 ] && { echo "SELL-HOME PARITY BLOCKED"; exit 1; }
echo "All SELL-home parity checks passed."
