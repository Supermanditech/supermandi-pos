#!/usr/bin/env bash
# V3-HARDEN-178: Release gate — B2B procurement lifecycle
# Validates structural readiness for the supplier-draft → SuperAdmin-publish →
# retailer-browse/cart/checkout → payment-intent → order-status chain.
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

# ── LAYER 6: Order API ──
echo ""
echo "── Layer 6: Order API ──"

if grep -q "paymentMode" src/services/api/orderApi.ts; then
  echo "PASS: CreateOrderParams includes paymentMode"
else
  echo "FAIL: OrderApi missing paymentMode"
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
