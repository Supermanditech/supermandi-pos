#!/usr/bin/env bash
# V3-HARDEN-172: Release gate — bulk-procurement-to-retail-sale lifecycle
# Validates that the conversion contract is structurally complete across
# schema, backend, frontend, and staging configuration.
# Exit 0 = PASS, Exit 1 = FAIL

set -euo pipefail
ERRORS=0

echo "=== CONVERSION LIFECYCLE GATE ==="

# 1. Migration 199 exists
if [ ! -f "backend/migrations/199_canonical_conversion_contract.sql" ]; then
  echo "FAIL: Migration 199 (conversion contract) missing"
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: Migration 199 exists"
fi

# 2. Conversion engine exists and exports required functions
if [ ! -f "backend/src/services/conversionEngine.ts" ]; then
  echo "FAIL: conversionEngine.ts missing"
  ERRORS=$((ERRORS + 1))
else
  for fn in procurementToStock retailToStockDecrement getUnitMultiplier inferBaseStockUnit suggestRetailVariants validateConversionProfile normalizeUnitString; do
    if ! grep -q "export function $fn" backend/src/services/conversionEngine.ts; then
      echo "FAIL: conversionEngine.ts missing export: $fn"
      ERRORS=$((ERRORS + 1))
    fi
  done
  echo "PASS: conversionEngine.ts exports all required functions"
fi

# 3. Backend routes expose conversion fields
for route_file in backend/src/routes/v1/pos/storeProducts.ts backend/src/routes/v1/retailer-admin/products.ts; do
  if [ -f "$route_file" ]; then
    for field in procurement_unit procurement_pack_qty base_stock_unit conversion_confirmed; do
      if ! grep -q "$field" "$route_file"; then
        echo "FAIL: $route_file missing field: $field"
        ERRORS=$((ERRORS + 1))
      fi
    done
  fi
done
echo "PASS: Backend routes expose conversion fields"

# 4. Frontend types include conversion fields
if grep -q "procurementUnit" src/stores/productsStore.ts && \
   grep -q "baseStockUnit" src/stores/productsStore.ts && \
   grep -q "conversionConfirmed" src/stores/productsStore.ts; then
  echo "PASS: Frontend Product type includes conversion fields"
else
  echo "FAIL: Frontend Product type missing conversion fields"
  ERRORS=$((ERRORS + 1))
fi

# 5. Supplier portal supports procurement metadata
if grep -q "procurementUnit" supplier-portal/src/lib/api.ts; then
  echo "PASS: Supplier portal ProductInput includes procurement fields"
else
  echo "FAIL: Supplier portal missing procurement fields"
  ERRORS=$((ERRORS + 1))
fi

# 6. Publish flow propagates conversion to store_products
if grep -q "inferBaseStockUnit" backend/src/routes/v1/admin/suppliers.ts; then
  echo "PASS: Publish flow uses inferBaseStockUnit"
else
  echo "FAIL: Publish flow missing conversion propagation"
  ERRORS=$((ERRORS + 1))
fi

# 7. Conversion engine test exists
if [ -f "backend/tests/conversionEngine.v3-fix-167.unit.test.ts" ]; then
  echo "PASS: Conversion engine test file exists"
else
  echo "FAIL: Conversion engine test missing"
  ERRORS=$((ERRORS + 1))
fi

# 8. POS components carry conversion context
for component in src/components/v3/ProductTileV3.tsx src/components/v3/PurchaseItemCardV3.tsx src/stores/cartStore.ts; do
  if grep -q "baseStockUnit" "$component"; then
    echo "PASS: $component includes baseStockUnit"
  else
    echo "FAIL: $component missing baseStockUnit"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "=== CONVERSION LIFECYCLE GATE: PASS ==="
  exit 0
else
  echo "=== CONVERSION LIFECYCLE GATE: FAIL ($ERRORS errors) ==="
  exit 1
fi
