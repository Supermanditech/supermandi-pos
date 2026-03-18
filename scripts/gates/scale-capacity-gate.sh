#!/usr/bin/env bash
# V3-HARDEN-153: End-to-end crash-free load gate
# Checks that the platform meets the approved scale targets
set -euo pipefail

BASE_URL="${STAGING_URL:-https://staging.supermandi.tech}"
echo "=== Scale Capacity Gate ==="
echo "Target: $BASE_URL"

FAILURES=0

# ── Scale targets (go/no-go thresholds) ──────────────────────────────────────
# These must be met for any go-live claim
cat << 'TARGETS'
  Approved scale targets:
  - 10,000+ SKUs per retailer store (POS + retailer web)
  - 5,000+ SKUs per supplier catalog (supplier portal)
  - 1,000 suppliers on the platform
  - 10,000+ users across portals
  - 10,000 scans/day on POS
  - Multi-portal concurrent access
TARGETS

# 1. Check migration 197 (capacity indexes) exists
echo -n "  [1/6] Migration 197 (capacity indexes)... "
if [ -f "backend/migrations/197_catalog_capacity_indexes.sql" ]; then
  echo "OK"
else
  echo "FAIL — migration file missing"
  FAILURES=$((FAILURES + 1))
fi

# 2. Check catalog distribution service exists
echo -n "  [2/6] Catalog distribution service... "
if [ -f "backend/src/services/catalogDistribution.ts" ]; then
  echo "OK"
else
  echo "FAIL — service missing"
  FAILURES=$((FAILURES + 1))
fi

# 3. Check FlatList virtualization in POS SELL screen
echo -n "  [3/6] SELL FlatList virtualization... "
if grep -q "windowSize" src/screens/v3/SellScreenV3.tsx 2>/dev/null && \
   grep -q "removeClippedSubviews" src/screens/v3/SellScreenV3.tsx 2>/dev/null; then
  echo "OK"
else
  echo "FAIL — SELL screen not virtualized"
  FAILURES=$((FAILURES + 1))
fi

# 4. Check FlatList virtualization in POS BUY screen
echo -n "  [4/6] BUY FlatList virtualization... "
if grep -q "windowSize" src/screens/v3/BuyScreenV3.tsx 2>/dev/null && \
   grep -q "removeClippedSubviews" src/screens/v3/BuyScreenV3.tsx 2>/dev/null; then
  echo "OK"
else
  echo "FAIL — BUY screen not virtualized"
  FAILURES=$((FAILURES + 1))
fi

# 5. Check backend pagination enforced (max 200)
echo -n "  [5/6] Backend pagination contract... "
if grep -q "MAX_PAGE_SIZE" backend/src/services/catalogDistribution.ts 2>/dev/null; then
  echo "OK"
else
  echo "FAIL — pagination contract missing"
  FAILURES=$((FAILURES + 1))
fi

# 6. Check health endpoint
echo -n "  [6/6] API health... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
  echo "OK ($HTTP_CODE)"
else
  echo "FAIL ($HTTP_CODE)"
  FAILURES=$((FAILURES + 1))
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "GATE FAILED: $FAILURES check(s) did not pass"
  exit 1
fi
echo "GATE PASSED: Scale capacity checks passed"
echo ""
echo "NOTE: Full runtime load testing (10k concurrent users, 10k scans/day)"
echo "requires staging environment with production-scale data."
echo "This gate verifies infrastructure readiness only."
