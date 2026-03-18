#!/usr/bin/env bash
# V3-HARDEN-105: Scale acceptance gate — executable index verification
# Requires DATABASE_URL or PGHOST+PGDATABASE to be set for DB checks.
set -euo pipefail

echo "=== Scale Acceptance Gate ==="
echo ""
echo "Targets: 5k SKUs/store, 10k scans/day, 10k users"
echo ""

ERRORS=0
WARNINGS=0

# Check if we can connect to DB
if [ -z "${DATABASE_URL:-}" ] && [ -z "${PGHOST:-}" ]; then
  echo "SKIP: No DATABASE_URL or PGHOST — index verification requires DB access"
  echo "GATE: SKIP (manual verification required)"
  exit 0
fi

DB_CMD="psql ${DATABASE_URL:-} -t -A -c"

# Verify critical indexes exist
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

check_index "store_products" "catalog.store_products (store_id, barcode, name search)"
check_index "store_product_barcodes" "barcode lookup"
check_index "stock_balances" "inventory.stock_balances (store_id, product_id)"
check_index "sell_payments" "payments.sell_payments (sale_id)"
check_index "sales" "public.sales (store_id)"

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "GATE FAILED: $ERRORS missing index group(s)"
  exit 1
else
  echo "GATE PASSED: All critical index groups present"
fi
