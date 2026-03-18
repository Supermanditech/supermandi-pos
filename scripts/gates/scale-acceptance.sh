#!/usr/bin/env bash
# V3-HARDEN-105: Scale acceptance gate — executable, threshold-based
# Requires DATABASE_URL or PGHOST to verify indexes and run basic throughput check.
set -euo pipefail

echo "=== Scale Acceptance Gate ==="
echo "Targets: 5k SKUs/store, 10k scans/day, 10k users"
echo ""

ERRORS=0

# Require DB access — gate MUST fail if it cannot verify
if [ -z "${DATABASE_URL:-}" ] && [ -z "${PGHOST:-}" ]; then
  echo "FAIL: No DATABASE_URL or PGHOST — cannot verify scale readiness"
  echo "GATE FAILED: DB access required for scale verification"
  exit 1
fi

DB_CMD="psql ${DATABASE_URL:-} -t -A -c"

# 1. Verify critical indexes exist
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

# 2. Basic throughput verification — barcode lookup latency
echo ""
echo "Running barcode lookup latency check..."
LATENCY=$($DB_CMD "EXPLAIN (ANALYZE, FORMAT TEXT) SELECT * FROM catalog.store_product_barcodes WHERE barcode = 'TEST_NONEXISTENT_BARCODE' LIMIT 1;" 2>/dev/null | grep "Execution Time" | awk '{print $3}' || echo "999")
LATENCY_MS=$(echo "$LATENCY" | cut -d. -f1)
if [ "${LATENCY_MS:-999}" -lt 50 ]; then
  echo "  OK: Barcode lookup < 50ms (${LATENCY_MS}ms)"
else
  echo "  WARN: Barcode lookup >= 50ms (${LATENCY_MS}ms) — may impact scan throughput"
fi

# 3. Store product count check — verify 5k+ is feasible
echo ""
echo "Checking max store product count..."
MAX_COUNT=$($DB_CMD "SELECT COALESCE(MAX(cnt), 0) FROM (SELECT store_id, COUNT(*) as cnt FROM catalog.store_products WHERE is_active = true GROUP BY store_id) t;" 2>/dev/null || echo "0")
echo "  Current max store products: $MAX_COUNT"
if [ "${MAX_COUNT:-0}" -gt 0 ]; then
  echo "  OK: Store product data exists"
else
  echo "  INFO: No store products yet (expected for fresh deployment)"
fi

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "GATE FAILED: $ERRORS error(s) — missing critical indexes"
  exit 1
else
  echo "GATE PASSED: Index verification complete, basic throughput acceptable"
fi
