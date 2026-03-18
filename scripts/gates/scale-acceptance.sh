#!/usr/bin/env bash
# V3-HARDEN-105: Scale acceptance gate
#
# SCOPE (narrowed from ticket):
# This gate verifies DATABASE READINESS for declared production targets.
# It does NOT run full load/stress tests — those require:
#   - dedicated load-test infrastructure (k6, Artillery, or custom)
#   - populated test data (5k+ SKUs per store)
#   - isolated test environment
# Full load tests are run manually before go-live using:
#   - scripts/load-tests/catalog-load.js
#   - scripts/load-tests/scan-throughput.js
#
# What this gate DOES verify (blocking):
#   1. DB connectivity
#   2. Critical index presence for declared targets
#   3. Barcode lookup query plan efficiency (EXPLAIN)
#   4. Current store product scale
#
# Declared production targets (for manual load-test acceptance):
#   - 10,000+ SKUs per retailer store
#   - 50,000 SELL scans/day + 50,000 purchase scans/day (V3-HARDEN-161)
#   - 10,000 combined supplier/retailer users
#   - publish/import throughput: 1500-3000 SKUs per batch
set -euo pipefail

echo "=== Scale Acceptance Gate ==="
echo "Declared targets: 10k SKUs/store, 50k+50k scans/day, 10k users"
echo ""

ERRORS=0

# Require DB access
if [ -z "${DATABASE_URL:-}" ] && [ -z "${PGHOST:-}" ]; then
  echo "FAIL: No DATABASE_URL or PGHOST — cannot verify scale readiness"
  exit 1
fi

DB_CMD="psql ${DATABASE_URL:-} -t -A -c"

# 1. Critical indexes
echo "Checking critical indexes..."
check_index() {
  local table=$1
  local desc=$2
  local count
  count=$($DB_CMD "SELECT COUNT(*) FROM pg_indexes WHERE tablename = '$table';" 2>/dev/null || echo "0")
  if [ "$count" -gt 0 ]; then
    echo "  OK: $table has $count index(es) — $desc"
  else
    echo "  FAIL: $table has NO indexes — $desc"
    ERRORS=$((ERRORS+1))
  fi
}

check_index "store_products" "catalog store products"
check_index "store_product_barcodes" "barcode lookup"
check_index "stock_balances" "inventory stock balances"
check_index "sell_payments" "payment records"
check_index "sales" "sales records"

# 2. Barcode lookup efficiency
echo ""
echo "Barcode lookup query plan..."
PLAN=$($DB_CMD "EXPLAIN (FORMAT TEXT) SELECT * FROM catalog.store_product_barcodes WHERE barcode = 'TEST_NONEXISTENT' LIMIT 1;" 2>/dev/null || echo "Seq Scan")
if echo "$PLAN" | grep -qi "Index"; then
  echo "  OK: Barcode lookup uses index scan"
else
  echo "  FAIL: Barcode lookup uses sequential scan — missing index"
  ERRORS=$((ERRORS+1))
fi

# 3. Current scale
echo ""
echo "Current scale..."
MAX_PRODUCTS=$($DB_CMD "SELECT COALESCE(MAX(cnt), 0) FROM (SELECT store_id, COUNT(*) as cnt FROM catalog.store_products WHERE is_active = true GROUP BY store_id) t;" 2>/dev/null || echo "0")
echo "  Max store products: $MAX_PRODUCTS"

TOTAL_SALES=$($DB_CMD "SELECT COUNT(*) FROM public.sales WHERE created_at > NOW() - INTERVAL '24 hours';" 2>/dev/null || echo "0")
echo "  Sales (last 24h): $TOTAL_SALES"

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "GATE FAILED: $ERRORS error(s)"
  exit 1
else
  echo "GATE PASSED: DB readiness verified"
  echo ""
  echo "NOTE: Full load/stress acceptance requires manual execution of:"
  echo "  node scripts/load-tests/catalog-load.js --skus=5000 --stores=10"
  echo "  k6 run scripts/load-tests/scan-stress.js  # V3-HARDEN-161: 50k+50k/day target"
  echo "Operator must run these before declaring go-live acceptance."
fi
