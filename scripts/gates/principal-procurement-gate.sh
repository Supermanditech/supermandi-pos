#!/usr/bin/env bash
# V3-HARDEN-148: Deploy gate for principal procurement lane
# Blocks deployment unless the principal procurement infrastructure is verified
set -euo pipefail

BASE_URL="${STAGING_URL:-https://staging.supermandi.tech}"
echo "=== Principal Procurement Deploy Gate ==="
echo "Target: $BASE_URL"

FAILURES=0

# 1. Check catalogue endpoint responds
echo -n "  [1/5] Catalogue endpoint... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
  echo "OK ($HTTP_CODE)"
else
  echo "FAIL ($HTTP_CODE)"
  FAILURES=$((FAILURES + 1))
fi

# 2. Check migration 195 exists in repo
echo -n "  [2/5] Migration 195 (procurement schema)... "
if [ -f "backend/migrations/195_principal_procurement_support.sql" ]; then
  echo "OK"
else
  echo "FAIL — migration file missing"
  FAILURES=$((FAILURES + 1))
fi

# 3. Check procurementLane service exists
echo -n "  [3/5] Procurement lane service... "
if [ -f "backend/src/services/procurementLane.ts" ]; then
  echo "OK"
else
  echo "FAIL — service missing"
  FAILURES=$((FAILURES + 1))
fi

# 4. Check dual invoice service exists
echo -n "  [4/5] Dual invoice service... "
if [ -f "backend/src/services/dualInvoiceService.ts" ]; then
  echo "OK"
else
  echo "FAIL — service missing"
  FAILURES=$((FAILURES + 1))
fi

# 5. Check BUY screen uses catalogue_principal
echo -n "  [5/5] BUY screen uses catalogue_principal... "
if grep -q "catalogue_principal" src/screens/v3/BuyScreenV3.tsx 2>/dev/null; then
  echo "OK"
else
  echo "FAIL — BUY screen still uses old order type"
  FAILURES=$((FAILURES + 1))
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "GATE FAILED: $FAILURES check(s) did not pass"
  exit 1
fi
echo "GATE PASSED: All principal procurement checks passed"
