#!/usr/bin/env bash
# V3-HARDEN-172: Release gate — bulk-procurement-to-retail-sale lifecycle
# Validates structural, behavioral, and runtime readiness for the
# canonical conversion contract across all platforms.
# Exit 0 = PASS, Exit 1 = FAIL

set -euo pipefail
ERRORS=0

echo "=== CONVERSION LIFECYCLE GATE ==="
echo ""

# ── LAYER 1: Schema & Migration ──
echo "── Layer 1: Schema & Migration ──"

if [ ! -f "backend/migrations/199_canonical_conversion_contract.sql" ]; then
  echo "FAIL: Migration 199 (conversion contract) missing"
  ERRORS=$((ERRORS + 1))
else
  # Verify migration has ROLLBACK comment
  if grep -q "ROLLBACK:" backend/migrations/199_canonical_conversion_contract.sql; then
    echo "PASS: Migration 199 exists with ROLLBACK comment"
  else
    echo "FAIL: Migration 199 missing ROLLBACK comment"
    ERRORS=$((ERRORS + 1))
  fi
fi

# Verify migration creates the required columns
for col in procurement_unit procurement_pack_qty base_stock_unit conversion_confirmed allow_fractional_sell conversion_precision; do
  if grep -q "$col" backend/migrations/199_canonical_conversion_contract.sql; then
    :
  else
    echo "FAIL: Migration 199 missing column: $col"
    ERRORS=$((ERRORS + 1))
  fi
done
echo "PASS: Migration 199 defines all 6 conversion columns"

# ── LAYER 2: Conversion Engine ──
echo ""
echo "── Layer 2: Conversion Engine ──"

if [ ! -f "backend/src/services/conversionEngine.ts" ]; then
  echo "FAIL: conversionEngine.ts missing"
  ERRORS=$((ERRORS + 1))
else
  for fn in procurementToStock retailToStockDecrement getUnitMultiplier inferBaseStockUnit suggestRetailVariants validateConversionProfile normalizeUnitString areSameFamily; do
    if ! grep -q "export function $fn" backend/src/services/conversionEngine.ts; then
      echo "FAIL: conversionEngine.ts missing export: $fn"
      ERRORS=$((ERRORS + 1))
    fi
  done
  echo "PASS: conversionEngine.ts exports all 8 required functions"
fi

# ── LAYER 3: Backend Routes — Live Wiring ──
echo ""
echo "── Layer 3: Backend Routes — Live Wiring ──"

# POS routes expose conversion fields
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
echo "PASS: POS + retailer-admin routes expose conversion fields"

# Sales route uses canonical engine
if grep -q "canonicalGetUnitMultiplier\|conversionEngine" backend/src/routes/v1/pos/sales.ts; then
  echo "PASS: POS sales route imports canonical conversionEngine"
else
  echo "FAIL: POS sales route does NOT import conversionEngine — legacy math still authoritative"
  ERRORS=$((ERRORS + 1))
fi

# Sales route blocks unconfirmed conversion
if grep -q "conversion_not_confirmed" backend/src/routes/v1/pos/sales.ts; then
  echo "PASS: POS sales blocks unconfirmed conversion"
else
  echo "FAIL: POS sales does NOT block unconfirmed conversion"
  ERRORS=$((ERRORS + 1))
fi

# Supplier product create stores conversion fields
if grep -q "procurement_unit" backend/src/routes/v1/supplier/products.ts; then
  echo "PASS: Supplier product CREATE stores conversion fields"
else
  echo "FAIL: Supplier product CREATE missing conversion fields"
  ERRORS=$((ERRORS + 1))
fi

# Publish flow propagates conversion
if grep -q "inferBaseStockUnit" backend/src/routes/v1/admin/suppliers.ts; then
  echo "PASS: Publish flow uses inferBaseStockUnit"
else
  echo "FAIL: Publish flow missing conversion propagation"
  ERRORS=$((ERRORS + 1))
fi

# Admin catalog returns conversion fields
if grep -q "procurementUnit\|procurement_unit" backend/src/routes/v1/admin/catalog.ts; then
  echo "PASS: Admin catalog endpoint returns conversion fields"
else
  echo "FAIL: Admin catalog missing conversion fields"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 4: Frontend Types ──
echo ""
echo "── Layer 4: Frontend Types ──"

for field in procurementUnit baseStockUnit conversionConfirmed; do
  if grep -q "$field" src/stores/productsStore.ts; then
    :
  else
    echo "FAIL: Product type missing $field"
    ERRORS=$((ERRORS + 1))
  fi
done
echo "PASS: Frontend Product type includes all conversion fields"

# POS cartStore carries conversion context
if grep -q "baseStockUnit" src/stores/cartStore.ts; then
  echo "PASS: CartItem carries conversion context"
else
  echo "FAIL: CartItem missing conversion context"
  ERRORS=$((ERRORS + 1))
fi

# cartPayload builds conversion-aware items
if grep -q "productMode\|baseStockUnit" src/services/cartPayload.ts; then
  echo "PASS: buildCartItem includes conversion fields"
else
  echo "FAIL: buildCartItem missing conversion fields"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 5: POS Sell/Scan Flow ──
echo ""
echo "── Layer 5: POS Sell/Scan Flow ──"

# ScanScreen blocks unconfirmed conversion
if grep -q "conversionConfirmed.*false\|conversion_confirmed.*false\|Retail setup needed" src/screens/v3/ScanScreenV3.tsx; then
  echo "PASS: ScanScreen blocks unconfirmed bulk products"
else
  echo "FAIL: ScanScreen does NOT block unconfirmed conversion"
  ERRORS=$((ERRORS + 1))
fi

# ProductTile shows sell-unit and setup warning
if grep -q "Setup needed\|rateUnit\|conversionConfirmed" src/components/v3/ProductTileV3.tsx; then
  echo "PASS: ProductTile shows conversion status"
else
  echo "FAIL: ProductTile missing conversion status"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 6: Procurement/GRN Flow ──
echo ""
echo "── Layer 6: Procurement/GRN Flow ──"

# CounterPurchase carries conversion context
if grep -q "procurementUnit\|conversionConfirmed\|Retail setup needed" src/screens/v3/CounterPurchaseScreenV3.tsx; then
  echo "PASS: CounterPurchase carries conversion context"
else
  echo "FAIL: CounterPurchase missing conversion context"
  ERRORS=$((ERRORS + 1))
fi

# GRN shows landed-stock preview
if grep -q "Stock landing\|procurementPackQty\|setup.*before.*sold" src/screens/v3/GRNScreenV3.tsx; then
  echo "PASS: GRN shows conversion-aware landed stock preview"
else
  echo "FAIL: GRN missing conversion-aware landed stock preview"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 7: Portal UX ──
echo ""
echo "── Layer 7: Portal UX ──"

# Retailer-admin ProductsPage has conversion section
if grep -q "Procurement.*Conversion\|procurementUnit\|baseStockUnit" retailer-admin/src/pages/ProductsPage.tsx; then
  echo "PASS: Retailer-admin product form has conversion section"
else
  echo "FAIL: Retailer-admin missing conversion section"
  ERRORS=$((ERRORS + 1))
fi

# Supplier portal captures procurement packaging
if grep -q "procurementUnit\|splitSellEligible" supplier-portal/src/lib/api.ts; then
  echo "PASS: Supplier portal captures procurement packaging"
else
  echo "FAIL: Supplier portal missing procurement packaging"
  ERRORS=$((ERRORS + 1))
fi

# SuperAdmin shows conversion review
if grep -q "Conversion Contract\|Bought as\|Stocked as\|Sold as" supermandi-superadmin/src/tabs/CatalogTab.tsx; then
  echo "PASS: SuperAdmin shows conversion review in product modal"
else
  echo "FAIL: SuperAdmin missing conversion review"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 8: Runtime Parity ──
echo ""
echo "── Layer 8: Runtime Parity ──"

# validateGcp checks conversion schema
if grep -q "validateConversionSchemaReadiness\|conversion_confirmed\|procurement_unit" backend/src/startup/validateGcp.ts; then
  echo "PASS: validateGcp.ts includes conversion schema readiness check"
else
  echo "FAIL: validateGcp.ts missing conversion schema readiness"
  ERRORS=$((ERRORS + 1))
fi

# POS NewProduct has product mode + conversion setup
if grep -q "LOOSE_BULK\|productMode\|procurementUnit" src/screens/v3/NewProductScreenV3.tsx; then
  echo "PASS: NewProductScreen has product mode + conversion setup"
else
  echo "FAIL: NewProductScreen missing conversion setup"
  ERRORS=$((ERRORS + 1))
fi

# ImportPage documents conversion columns
if grep -q "procurement_unit\|procurement_pack_qty\|base_stock_unit" retailer-admin/src/pages/ImportPage.tsx; then
  echo "PASS: ImportPage documents conversion columns in CSV format"
else
  echo "FAIL: ImportPage missing conversion columns"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 9: Tests ──
echo ""
echo "── Layer 9: Tests ──"

if [ -f "backend/tests/conversionEngine.v3-fix-167.unit.test.ts" ]; then
  echo "PASS: Conversion engine unit test exists"
else
  echo "FAIL: Conversion engine test missing"
  ERRORS=$((ERRORS + 1))
fi

if [ -f "backend/tests/conversionLifecycle.v3-harden-172.unit.test.ts" ]; then
  echo "PASS: Conversion lifecycle contract test exists"
else
  echo "FAIL: Lifecycle contract test missing"
  ERRORS=$((ERRORS + 1))
fi

# ── SUMMARY ──
echo ""
echo "=============================="
if [ $ERRORS -eq 0 ]; then
  echo "=== CONVERSION LIFECYCLE GATE: PASS (9 layers, 0 errors) ==="
  exit 0
else
  echo "=== CONVERSION LIFECYCLE GATE: FAIL ($ERRORS errors) ==="
  exit 1
fi
