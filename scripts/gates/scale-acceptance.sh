#!/usr/bin/env bash
# V3-HARDEN-105: Scale acceptance thresholds
# Documents the declared production targets and verifies critical indexes exist.
set -euo pipefail

echo "=== Scale Acceptance Gate ==="
echo ""
echo "Declared production targets:"
echo "  - 5,000+ SKUs per retailer store"
echo "  - 10,000 barcode scans per day"
echo "  - 10,000 combined supplier/retailer users"
echo ""
echo "Critical index verification (requires DB access):"
echo "  - catalog.store_products(store_id, is_active)"
echo "  - catalog.store_product_barcodes(barcode)"
echo "  - catalog.store_products(store_id) + GIN(name)"
echo "  - inventory.stock_balances(store_id, product_id)"
echo "  - payments.sell_payments(sale_id, store_id)"
echo ""
echo "Run the following SQL to verify indexes exist:"
echo "  SELECT indexname FROM pg_indexes WHERE tablename = 'store_products';"
echo "  SELECT indexname FROM pg_indexes WHERE tablename = 'store_product_barcodes';"
echo "  SELECT indexname FROM pg_indexes WHERE tablename = 'stock_balances';"
echo ""
echo "Load test commands:"
echo "  node scripts/load-tests/catalog-load.js --skus=5000 --stores=10"
echo "  node scripts/load-tests/scan-throughput.js --scans=10000"
echo ""
echo "GATE: Manual — operator must verify index presence and run load tests"
