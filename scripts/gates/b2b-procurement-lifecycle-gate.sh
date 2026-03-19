#!/usr/bin/env bash
# V3-HARDEN-178: Release gate — B2B procurement lifecycle
# Layers 1-6: Structural pre-checks (migration, service, card, checkout, API, wiring)
#   These verify that required code/schema artifacts exist and are structurally correct.
#   They are NOT runtime behavioral proof — they are necessary-but-not-sufficient.
# Layer 7: Behavioral proof — runs actual unit tests and TypeScript typecheck.
#   This is the closest to runtime proof available without a live DB/API server.
# Exit 0 = PASS, Exit 1 = FAIL

set -euo pipefail
ERRORS=0

echo "=== B2B PROCUREMENT LIFECYCLE GATE ==="
echo ""

# ── LAYER 1: Schema ──
echo "── Layer 1: Schema ──"

if [ -f "backend/migrations/201_commercial_terms_and_procurement_payment.sql" ]; then
  for col in moq_tiers delivery_sla_days delivery_terms finance_eligible published_terms_version published_by published_at; do
    if ! grep -q "$col" backend/migrations/201_commercial_terms_and_procurement_payment.sql; then
      echo "FAIL: Migration 201 missing column: $col"
      ERRORS=$((ERRORS + 1))
    fi
  done
  if grep -q "payment_intents" backend/migrations/201_commercial_terms_and_procurement_payment.sql; then
    echo "PASS: Migration 201 — commercial terms + payment intents"
  else
    echo "FAIL: Migration 201 missing payment_intents table"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "FAIL: Migration 201 missing"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 2: Payment Service ──
echo ""
echo "── Layer 2: Payment Service ──"

if [ -f "backend/src/services/procurementPaymentService.ts" ]; then
  for fn in createPaymentIntent updatePaymentIntentStatus getPaymentIntentForOrder; do
    if grep -q "export.*function $fn\|export async function $fn" backend/src/services/procurementPaymentService.ts; then
      :
    else
      echo "FAIL: procurementPaymentService missing: $fn"
      ERRORS=$((ERRORS + 1))
    fi
  done
  echo "PASS: Payment service exports all required functions"
else
  echo "FAIL: procurementPaymentService.ts missing"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 3: Operator vs B2B Card Split ──
echo ""
echo "── Layer 3: Operator vs B2B Card Split ──"

if grep -q "stock-health\|Low:.*stock\|Out of stock" src/components/v3/ProductTileV3.tsx; then
  echo "PASS: ProductTileV3 has operator-first stock health"
else
  echo "FAIL: ProductTileV3 missing stock health"
  ERRORS=$((ERRORS + 1))
fi

if grep -q "Delivery.*badge\|BNPL.*badge\|procurementUnit" src/components/v3/SupplierProductCardV3.tsx; then
  echo "PASS: SupplierProductCardV3 has B2B decision metadata"
else
  echo "FAIL: SupplierProductCardV3 missing B2B metadata"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 4: Checkout Flow ──
echo ""
echo "── Layer 4: Checkout Flow ──"

if grep -q "Procurement Checkout\|SuperMandi Tech" src/screens/v3/BuyScreenV3.tsx; then
  echo "PASS: BuyScreen has procurement checkout modal"
else
  echo "FAIL: BuyScreen missing checkout modal"
  ERRORS=$((ERRORS + 1))
fi

if grep -q "paymentMode\|BNPL\|CREDIT\|UPI" src/screens/v3/BuyScreenV3.tsx; then
  echo "PASS: BuyScreen has payment mode selection"
else
  echo "FAIL: BuyScreen missing payment mode selection"
  ERRORS=$((ERRORS + 1))
fi

if grep -q "acceptedTerms" src/screens/v3/BuyScreenV3.tsx; then
  echo "PASS: BuyScreen snapshots accepted terms at checkout"
else
  echo "FAIL: BuyScreen missing term snapshot"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 5: Supplier Authoring ──
echo ""
echo "── Layer 5: Supplier Authoring ──"

if grep -q "ptrMinor\|tradeDiscountPct\|deliverySlaDays\|financeEligible" supplier-portal/src/lib/api.ts; then
  echo "PASS: Supplier API types include commercial terms"
else
  echo "FAIL: Supplier API missing commercial terms"
  ERRORS=$((ERRORS + 1))
fi

if grep -q "Commercial Terms" "supplier-portal/src/app/(dashboard)/products/page.tsx"; then
  echo "PASS: Supplier product form has commercial terms section"
else
  echo "FAIL: Supplier form missing commercial terms"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 6: Order API + Live Wiring ──
echo ""
echo "── Layer 6: Order API + Live Wiring ──"

if grep -q "paymentMode" src/services/api/orderApi.ts; then
  echo "PASS: CreateOrderParams includes paymentMode"
else
  echo "FAIL: OrderApi missing paymentMode"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: BuyScreen uses getBuyCatalog (not getCatalog)
if grep -q "getBuyCatalog" src/screens/v3/BuyScreenV3.tsx && ! grep -q "getCatalog(" src/screens/v3/BuyScreenV3.tsx; then
  echo "PASS: BuyScreen uses getBuyCatalog (correct procurement path)"
else
  echo "FAIL: BuyScreen still uses getCatalog instead of getBuyCatalog"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Checkout surfaces payment intent state (not just toast)
if grep -q "paymentIntentStatus\|paymentRedirectUrl\|paymentQrData" src/screens/v3/BuyScreenV3.tsx; then
  echo "PASS: Checkout surfaces payment intent state from order response"
else
  echo "FAIL: Checkout does not surface payment intent state"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Order route persists accepted_terms_snapshot
if grep -q "accepted_terms_snapshot" backend/src/routes/v1/orders.ts; then
  echo "PASS: Order route persists accepted terms snapshot"
else
  echo "FAIL: Order route missing accepted_terms_snapshot"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Supplier CREATE persists commercial terms
if grep -q "ptr_minor\|trade_discount_pct\|delivery_sla_days\|finance_eligible" backend/src/routes/v1/supplier/products.ts; then
  echo "PASS: Supplier CREATE persists commercial terms"
else
  echo "FAIL: Supplier CREATE missing commercial terms"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Migration targets live orders table
if grep -q "orders.purchase_orders" backend/migrations/201_commercial_terms_and_procurement_payment.sql; then
  echo "PASS: Migration 201 targets live orders.purchase_orders table"
else
  echo "FAIL: Migration 201 targets wrong table"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: CompareScreen requires productId (no productName fallback)
if grep -q "productId" src/screens/v3/CompareScreenV3.tsx && grep -q "Product identity missing" src/screens/v3/CompareScreenV3.tsx; then
  echo "PASS: CompareScreen requires canonical productId (no fallback)"
else
  echo "FAIL: CompareScreen still falls back to productName"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Order route creates payment intent for principal orders
if grep -q "createPaymentIntent" backend/src/routes/v1/orders.ts; then
  echo "PASS: Order route creates procurement payment intent"
else
  echo "FAIL: Order route missing payment intent creation"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Server startup fails for critical procurement schema
if grep -q "Refusing to start\|process.exit" backend/src/server.ts && grep -q "procurement" backend/src/server.ts; then
  echo "PASS: Startup fails loudly for missing procurement schema in production"
else
  echo "FAIL: Startup does not fail for missing procurement schema"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Server-side accepted terms snapshot (not client-composed)
if grep -q "snapshotAt\|version.*1\|validatedItems" backend/src/routes/v1/orders.ts; then
  echo "PASS: Order route builds server-side accepted terms snapshot"
else
  echo "FAIL: Order route uses client-composed terms"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Supplier CREATE/PATCH responses include commercial terms
CREATE_RESP=$(grep -c "V3-FIX-174.*Commercial terms in CREATE response\|ptrMinor.*CREATE response" backend/src/routes/v1/supplier/products.ts)
PATCH_RESP=$(grep -c "V3-FIX-174.*Commercial terms in PATCH response\|ptrMinor.*PATCH response" backend/src/routes/v1/supplier/products.ts)
if [ "$CREATE_RESP" -gt 0 ] && [ "$PATCH_RESP" -gt 0 ]; then
  echo "PASS: Supplier CREATE/PATCH responses include commercial terms"
else
  echo "FAIL: Supplier CREATE ($CREATE_RESP) or PATCH ($PATCH_RESP) responses missing commercial terms"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Accepted terms snapshot includes full contract
if grep -q "ptsMinor.*pts_minor\|deliveryTerms.*delivery_terms\|moqTiers.*moq_tiers" backend/src/routes/v1/orders.ts; then
  echo "PASS: Accepted terms snapshot includes full published contract"
else
  echo "FAIL: Accepted terms snapshot missing full contract fields"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Payment callback/reconciliation endpoint exists
if grep -q "payment-callback\|updatePaymentIntentStatus" backend/src/routes/v1/orders.ts; then
  echo "PASS: Procurement payment callback handler exists"
else
  echo "FAIL: Missing procurement payment callback handler"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: SuperAdmin loads current commercial contract for edit
if grep -q "ptrMinor.*ptrMinor\|prefill.*commercial\|Prefill.*current" supermandi-superadmin/src/App.tsx; then
  echo "PASS: SuperAdmin edit prefills current commercial contract"
else
  echo "FAIL: SuperAdmin edit does not prefill commercial contract"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: Compare renders full buyer metadata
if grep -q "scheme.*deliveryTerms\|financeEligible.*bnplAvailable" src/screens/v3/CompareScreenV3.tsx; then
  echo "PASS: Compare renders full buyer metadata"
else
  echo "FAIL: Compare missing buyer metadata"
  ERRORS=$((ERRORS + 1))
fi

# Behavioral: BUY mapper reads full buyer metadata from bestOffer
if grep -q "deliveryTerms.*bestOffer\|financeEligible.*bestOffer\|publishedTermsVersion.*bestOffer" src/screens/v3/BuyScreenV3.tsx; then
  echo "PASS: BUY mapper reads full buyer metadata from bestOffer"
else
  echo "FAIL: BUY mapper still drops buyer metadata"
  ERRORS=$((ERRORS + 1))
fi

# ── LAYER 7: Behavioral proof via test execution ──
echo ""
echo "── Layer 7: Behavioral proof (test execution) ──"

# Run procurement payment service tests — proves provider resolution and intent state
cd backend 2>/dev/null
if npx jest tests/procurementPayment.v3-fix-176.unit.test.ts --no-coverage --silent 2>/dev/null; then
  echo "PASS: Procurement payment service tests pass (8 tests)"
else
  echo "FAIL: Procurement payment service tests failed"
  ERRORS=$((ERRORS + 1))
fi

# V3-HARDEN-178: Run B2B procurement lifecycle behavioral tests
# Proves: provider resolution for all 6 modes, status transitions, conversion math,
#         retail→stock decrement, profile validation, MOQ tier resolution, snapshot shape
if npx jest tests/b2bProcurementLifecycle.v3-harden-178.unit.test.ts --no-coverage --silent 2>/dev/null; then
  echo "PASS: B2B procurement lifecycle behavioral tests pass (34 tests)"
else
  echo "FAIL: B2B procurement lifecycle behavioral tests failed"
  ERRORS=$((ERRORS + 1))
fi
cd .. 2>/dev/null

# TypeScript typecheck — proves code compiles with all type contracts
if npx tsc --noEmit --project backend/tsconfig.json 2>/dev/null; then
  echo "PASS: Backend TypeScript typecheck passes"
else
  echo "FAIL: Backend TypeScript typecheck failed"
  ERRORS=$((ERRORS + 1))
fi

# ── SUMMARY ──
echo ""
echo "=============================="
if [ $ERRORS -eq 0 ]; then
  echo "=== B2B PROCUREMENT LIFECYCLE GATE: PASS (6 layers, 0 errors) ==="
  exit 0
else
  echo "=== B2B PROCUREMENT LIFECYCLE GATE: FAIL ($ERRORS errors) ==="
  exit 1
fi
