#!/bin/bash
# ============================================================================
# Batch 6 Complete Tests - Database Schema Integrity
# GO-LIVE-196 to GO-LIVE-215 (20 tickets)
# Copy this to VM and run: bash run-batch6-tests.sh
# ============================================================================

# Database connection
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-supermandi}"
DB_USER="${DB_USER:-supermandi}"
DB_PASSWORD="${DB_PASSWORD:-supermandi}"

export PGPASSWORD="$DB_PASSWORD"

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -A"

echo ""
echo "========================================================================"
echo "  BATCH 6 COMPLETE TESTS - GO-LIVE-196 to GO-LIVE-215"
echo "========================================================================"
echo "  Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo "  Time: $(date)"
echo "========================================================================"

PASSED=0
FAILED=0

pass() { echo "✅ $1"; PASSED=$((PASSED+1)); }
fail() { echo "❌ $1: $2"; FAILED=$((FAILED+1)); }

# =============================================================================
# GO-LIVE-196: catalog.store_products FK to platform.stores
# =============================================================================
echo ""
echo "=== GO-LIVE-196: catalog.store_products FK ==="
FK_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_store_products_store_id' AND conrelid = 'catalog.store_products'::regclass")
[ "$FK_EXISTS" = "1" ] && pass "GO-LIVE-196: FK fk_store_products_store_id exists" || fail "GO-LIVE-196" "FK not found"

# =============================================================================
# GO-LIVE-197: inventory.stock_balances FKs
# =============================================================================
echo ""
echo "=== GO-LIVE-197: inventory.stock_balances FKs ==="
FK1=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_stock_balances_store' AND conrelid = 'inventory.stock_balances'::regclass")
FK2=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_stock_balances_product' AND conrelid = 'inventory.stock_balances'::regclass")
[ "$FK1" = "1" ] && [ "$FK2" = "1" ] && pass "GO-LIVE-197: stock_balances FKs exist" || fail "GO-LIVE-197" "FKs missing (store=$FK1, product=$FK2)"

# =============================================================================
# GO-LIVE-198: reorder.pending_reorders FKs
# =============================================================================
echo ""
echo "=== GO-LIVE-198: reorder.pending_reorders FKs ==="
FK1=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_pending_reorders_store' AND conrelid = 'reorder.pending_reorders'::regclass")
FK2=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_pending_reorders_product' AND conrelid = 'reorder.pending_reorders'::regclass")
FK3=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_pending_reorders_supplier' AND conrelid = 'reorder.pending_reorders'::regclass")
[ "$FK1" = "1" ] && [ "$FK2" = "1" ] && [ "$FK3" = "1" ] && pass "GO-LIVE-198: pending_reorders FKs exist" || fail "GO-LIVE-198" "FKs missing (store=$FK1, product=$FK2, supplier=$FK3)"

# =============================================================================
# GO-LIVE-199: payments.sell_payments FK to sales
# =============================================================================
echo ""
echo "=== GO-LIVE-199: payments.sell_payments FK ==="
FK_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_sell_payments_sale' AND conrelid = 'payments.sell_payments'::regclass")
[ "$FK_EXISTS" = "1" ] && pass "GO-LIVE-199: FK fk_sell_payments_sale exists" || fail "GO-LIVE-199" "FK not found"

# =============================================================================
# GO-LIVE-200: Composite index on (store_id, status, created_at)
# =============================================================================
echo ""
echo "=== GO-LIVE-200: Composite indexes ==="
IDX1=$($PSQL -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_purchase_orders_store_status_created'")
IDX2=$($PSQL -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_sales_store_status_created'")
[ "$IDX1" = "1" ] && [ "$IDX2" = "1" ] && pass "GO-LIVE-200: Composite indexes exist" || fail "GO-LIVE-200" "Indexes missing (orders=$IDX1, sales=$IDX2)"

# =============================================================================
# GO-LIVE-201: Index on inventory_ledger (store_id, product_id)
# =============================================================================
echo ""
echo "=== GO-LIVE-201: inventory_ledger index ==="
IDX_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_inventory_ledger_store_product'")
[ "$IDX_EXISTS" = "1" ] && pass "GO-LIVE-201: inventory_ledger index exists" || fail "GO-LIVE-201" "Index not found"

# =============================================================================
# GO-LIVE-202: pending_reorders partial unique constraint
# =============================================================================
echo ""
echo "=== GO-LIVE-202: pending_reorders unique constraint ==="
IDX_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'ux_pending_reorders_store_product_pending'")
[ "$IDX_EXISTS" = "1" ] && pass "GO-LIVE-202: Unique constraint exists" || fail "GO-LIVE-202" "Constraint not found"

# =============================================================================
# GO-LIVE-203: purchase_order_items unique (order_id, product_id)
# =============================================================================
echo ""
echo "=== GO-LIVE-203: purchase_order_items unique ==="
IDX_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'ux_purchase_order_items_order_product'")
[ "$IDX_EXISTS" = "1" ] && pass "GO-LIVE-203: Unique constraint exists" || fail "GO-LIVE-203" "Constraint not found"

# =============================================================================
# GO-LIVE-204: Sales partitioning index (prep)
# =============================================================================
echo ""
echo "=== GO-LIVE-204: Sales partitioning prep ==="
IDX_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_sales_created_at_month'")
[ "$IDX_EXISTS" = "1" ] && pass "GO-LIVE-204: Partitioning prep index exists" || fail "GO-LIVE-204" "Index not found"

# =============================================================================
# GO-LIVE-205: inventory_ledger partitioning index (prep)
# =============================================================================
echo ""
echo "=== GO-LIVE-205: inventory_ledger partitioning prep ==="
IDX_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_inventory_ledger_created_at_month'")
[ "$IDX_EXISTS" = "1" ] && pass "GO-LIVE-205: Partitioning prep index exists" || fail "GO-LIVE-205" "Index not found"

# =============================================================================
# GO-LIVE-206: CHECK on amount_minor > 0
# =============================================================================
echo ""
echo "=== GO-LIVE-206: Payment amount CHECK constraint ==="
CHK1=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_sell_payments_amount_positive' AND conrelid = 'payments.sell_payments'::regclass")
CHK2=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_buy_payments_amount_positive' AND conrelid = 'payments.buy_payments'::regclass")
[ "$CHK1" = "1" ] && [ "$CHK2" = "1" ] && pass "GO-LIVE-206: Amount CHECK constraints exist" || fail "GO-LIVE-206" "Constraints missing (sell=$CHK1, buy=$CHK2)"

# =============================================================================
# GO-LIVE-207: CHECK on sell_price <= mrp
# =============================================================================
echo ""
echo "=== GO-LIVE-207: sell_price <= mrp CHECK ==="
CHK_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_store_products_sell_price_mrp' AND conrelid = 'catalog.store_products'::regclass")
[ "$CHK_EXISTS" = "1" ] && pass "GO-LIVE-207: sell_price <= mrp CHECK exists" || fail "GO-LIVE-207" "Constraint not found"

# =============================================================================
# GO-LIVE-208: sales.id validation (CHECK constraint)
# =============================================================================
echo ""
echo "=== GO-LIVE-208: sales.id format CHECK ==="
CHK_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_sales_id_uuid_format' AND conrelid = 'public.sales'::regclass")
[ "$CHK_EXISTS" = "1" ] && pass "GO-LIVE-208: sales.id format CHECK exists" || fail "GO-LIVE-208" "Constraint not found"

# =============================================================================
# GO-LIVE-209: NOT NULL on created_by_user_id
# =============================================================================
echo ""
echo "=== GO-LIVE-209: created_by_user_id NOT NULL ==="
NOT_NULL=$($PSQL -c "SELECT NOT is_nullable::boolean FROM information_schema.columns WHERE table_schema = 'orders' AND table_name = 'purchase_orders' AND column_name = 'created_by_user_id'")
[ "$NOT_NULL" = "t" ] && pass "GO-LIVE-209: created_by_user_id is NOT NULL" || fail "GO-LIVE-209" "Column is nullable"

# =============================================================================
# GO-LIVE-210: supplier_store_links FK and audit columns
# =============================================================================
echo ""
echo "=== GO-LIVE-210: supplier_store_links FK and audit ==="
FK_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_supplier_store_links_store' AND conrelid = 'supplier.supplier_store_links'::regclass")
COL_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'supplier' AND table_name = 'supplier_store_links' AND column_name = 'approved_by_user_id'")
[ "$FK_EXISTS" = "1" ] && [ "$COL_EXISTS" = "1" ] && pass "GO-LIVE-210: FK and audit columns exist" || fail "GO-LIVE-210" "FK=$FK_EXISTS, audit_col=$COL_EXISTS"

# =============================================================================
# GO-LIVE-211: Duplicate tables handling (unified view)
# =============================================================================
echo ""
echo "=== GO-LIVE-211: unified_reorder_policies view ==="
VIEW_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'reorder' AND table_name = 'unified_reorder_policies'")
[ "$VIEW_EXISTS" = "1" ] && pass "GO-LIVE-211: unified_reorder_policies view exists" || fail "GO-LIVE-211" "View not found"

# =============================================================================
# GO-LIVE-212: Cross-schema FK enforcement
# =============================================================================
echo ""
echo "=== GO-LIVE-212: Cross-schema FKs ==="
FK1=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_inventory_ledger_store' AND conrelid = 'inventory.inventory_ledger'::regclass")
FK2=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_inventory_ledger_product' AND conrelid = 'inventory.inventory_ledger'::regclass")
FK3=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_reorder_policies_store' AND conrelid = 'reorder.reorder_policies'::regclass")
FK4=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_store_reorder_settings_store' AND conrelid = 'reorder.store_reorder_settings'::regclass")
FK5=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_order_sequences_store' AND conrelid = 'orders.order_sequences'::regclass")
TOTAL=$((FK1 + FK2 + FK3 + FK4 + FK5))
[ "$TOTAL" = "5" ] && pass "GO-LIVE-212: All cross-schema FKs exist ($TOTAL/5)" || fail "GO-LIVE-212" "Missing FKs ($TOTAL/5)"

# =============================================================================
# GO-LIVE-213: audit_log index (created_at DESC)
# =============================================================================
echo ""
echo "=== GO-LIVE-213: audit_log index ==="
IDX_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_audit_log_created_at_desc'")
[ "$IDX_EXISTS" = "1" ] && pass "GO-LIVE-213: audit_log index exists" || fail "GO-LIVE-213" "Index not found"

# =============================================================================
# GO-LIVE-214: Cascading deletes (buy_payments FK)
# =============================================================================
echo ""
echo "=== GO-LIVE-214: Cascading deletes ==="
FK_EXISTS=$($PSQL -c "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_buy_payments_purchase_order' AND conrelid = 'payments.buy_payments'::regclass")
[ "$FK_EXISTS" = "1" ] && pass "GO-LIVE-214: buy_payments FK exists" || fail "GO-LIVE-214" "FK not found"

# =============================================================================
# GO-LIVE-215: source_reorder_ids default array
# =============================================================================
echo ""
echo "=== GO-LIVE-215: source_reorder_ids default ==="
DEFAULT=$($PSQL -c "SELECT column_default FROM information_schema.columns WHERE table_schema = 'orders' AND table_name = 'purchase_orders' AND column_name = 'source_reorder_ids'")
NOT_NULL=$($PSQL -c "SELECT NOT is_nullable::boolean FROM information_schema.columns WHERE table_schema = 'orders' AND table_name = 'purchase_orders' AND column_name = 'source_reorder_ids'")
if [[ "$DEFAULT" == *"{}"* ]] && [ "$NOT_NULL" = "t" ]; then
  pass "GO-LIVE-215: source_reorder_ids has default array and NOT NULL"
else
  fail "GO-LIVE-215" "default='$DEFAULT', not_null=$NOT_NULL"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "========================================================================"
echo "  SUMMARY"
echo "========================================================================"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "========================================================================"
[ $FAILED -eq 0 ] && echo "  ✅ ALL TESTS PASSED - BATCH 6 COMPLETE!" || echo "  ⚠️ FIX REQUIRED"
echo "========================================================================"

exit $FAILED
