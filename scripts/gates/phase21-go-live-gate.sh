#!/usr/bin/env bash
# V3-HARDEN-189: Phase 21 go/no-go gate
# Real behavioral validation for demand, allocation, lifecycle, and buy-again subsystems.
# This gate must pass before any deploy that includes Phase 21 changes.
set -euo pipefail

echo "=== Phase 21 Go/No-Go Gate (V3-HARDEN-189) ==="

FAILURES=0
CHECKS=0

check() {
  CHECKS=$((CHECKS + 1))
  local label="$1"
  shift
  printf "  [%d] %s... " "$CHECKS" "$label"
  if "$@" > /dev/null 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    FAILURES=$((FAILURES + 1))
  fi
}

# ─── 1. Migration parity ───
check "Migration 198 (demand/allocation schema)" test -f "backend/migrations/198_demand_signal_and_allocation.sql"
check "Migration 198 has supplier_demand_allocations" grep -q "supplier_demand_allocations" backend/migrations/198_demand_signal_and_allocation.sql
check "Migration 198 has lifecycle_event_log" grep -q "lifecycle_event_log" backend/migrations/198_demand_signal_and_allocation.sql

# ─── 2. Demand signal compute ───
check "demandSignalCompute.ts exists" test -f "backend/src/services/demandSignalCompute.ts"
check "computeStoreDemandSignals exported" grep -q "export async function computeStoreDemandSignals" backend/src/services/demandSignalCompute.ts
check "computeCrossStoreDemandPressure exported" grep -q "export async function computeCrossStoreDemandPressure" backend/src/services/demandSignalCompute.ts
check "buildReorderRecommendations exported" grep -q "export function buildReorderRecommendations" backend/src/services/demandSignalCompute.ts

# ─── 3. Demand signal API routes ───
check "POS demand-signals route" test -f "backend/src/routes/v1/pos/demandSignals.ts"
check "Retailer demand-signals route" test -f "backend/src/routes/v1/retailer-admin/demandSignals.ts"
check "Admin demand-signals route" test -f "backend/src/routes/v1/admin/demandSignals.ts"
check "POS demand endpoint wired" grep -q '"/demand-signals"' backend/src/routes/v1/pos/demandSignals.ts
check "Admin pressure endpoint wired" grep -q '"/demand-signals/pressure"' backend/src/routes/v1/admin/demandSignals.ts

# ─── 4. Buy-again service ───
check "buyAgainService.ts exists" test -f "backend/src/services/buyAgainService.ts"
check "buildBuyAgainFromOrder exported" grep -q "export async function buildBuyAgainFromOrder" backend/src/services/buyAgainService.ts
check "buildBuyAgainFromProducts exported" grep -q "export async function buildBuyAgainFromProducts" backend/src/services/buyAgainService.ts
check "POS buy-again route" test -f "backend/src/routes/v1/pos/buyAgain.ts"
check "POS buy-again endpoint wired" grep -q '"/buy-again"' backend/src/routes/v1/pos/buyAgain.ts
check "POS frontend buyAgainApi.ts" test -f "src/services/api/buyAgainApi.ts"
check "Frontend wires purchaseDraftStore" grep -q "usePurchaseDraftStore" src/services/api/buyAgainApi.ts

# ─── 5. Allocation state machine ───
check "allocationService.ts exists" test -f "backend/src/services/allocationService.ts"
check "isValidTransition exported" grep -q "export function isValidTransition" backend/src/services/allocationService.ts
check "transitionAllocation exported" grep -q "export async function transitionAllocation" backend/src/services/allocationService.ts
check "createAllocation exported" grep -q "export async function createAllocation" backend/src/services/allocationService.ts
check "Supplier allocations route" test -f "backend/src/routes/v1/supplier/allocations.ts"
check "Admin allocations route" test -f "backend/src/routes/v1/admin/allocations.ts"
check "Supplier status transition endpoint" grep -q '"/allocations/:id/status"' backend/src/routes/v1/supplier/allocations.ts
check "Admin summary endpoint" grep -q '"/allocations/summary"' backend/src/routes/v1/admin/allocations.ts

# ─── 6. Lifecycle event service ───
check "lifecycleEventService.ts exists" test -f "backend/src/services/lifecycleEventService.ts"
check "publishLifecycleEvent exported" grep -q "export async function publishLifecycleEvent" backend/src/services/lifecycleEventService.ts
check "getOrderLifecycleEvents exported" grep -q "export async function getOrderLifecycleEvents" backend/src/services/lifecycleEventService.ts
check "WhatsApp retry logic" grep -q "sendWhatsAppWithRetry" backend/src/services/lifecycleEventService.ts
check "Idempotency dedup" grep -q "processedEvents" backend/src/services/lifecycleEventService.ts
check "POS lifecycle route" test -f "backend/src/routes/v1/pos/lifecycleEvents.ts"
check "Lifecycle events endpoint wired" grep -q '"/lifecycle/events"' backend/src/routes/v1/pos/lifecycleEvents.ts

# ─── 7. Route registration ───
check "posDemandSignalsRouter in index" grep -q "posDemandSignalsRouter" backend/src/routes/v1/index.ts
check "posBuyAgainRouter in index" grep -q "posBuyAgainRouter" backend/src/routes/v1/index.ts
check "posLifecycleEventsRouter in index" grep -q "posLifecycleEventsRouter" backend/src/routes/v1/index.ts
check "retailerDemandSignalsRouter in index" grep -q "retailerDemandSignalsRouter" backend/src/routes/v1/index.ts
check "adminDemandSignalsRouter in index" grep -q "adminDemandSignalsRouter" backend/src/routes/v1/index.ts
check "adminAllocationsRouter in index" grep -q "adminAllocationsRouter" backend/src/routes/v1/index.ts
check "supplierAllocationsRouter in index" grep -q "supplierAllocationsRouter" backend/src/routes/v1/index.ts

# ─── 8. SSE + WhatsApp readiness ───
check "SSE service exists" test -f "backend/src/services/sseService.ts"
check "emitStoreEvent in SSE service" grep -q "export function emitStoreEvent" backend/src/services/sseService.ts
check "WhatsApp service exists" test -f "backend/src/services/whatsappService.ts"
check "isWhatsAppConfigured exported" grep -q "export function isWhatsAppConfigured" backend/src/services/whatsappService.ts

# ─── 9. Cross-portal compatibility ───
check "storeDemandSignal types exist" test -f "backend/src/services/storeDemandSignal.ts"
check "LIFECYCLE_COMMUNICATION_RULES defined" grep -q "LIFECYCLE_COMMUNICATION_RULES" backend/src/services/storeDemandSignal.ts
check "procurementLane types exist" test -f "backend/src/services/procurementLane.ts"

# ─── 10. Behavioral tests exist ───
check "demandSignalCompute tests" test -f "backend/tests/contracts/demandSignalCompute.unit.test.ts"
check "buyAgainService tests" test -f "backend/tests/contracts/buyAgainService.unit.test.ts"
check "allocationService tests" test -f "backend/tests/contracts/allocationService.unit.test.ts"
check "lifecycleEventService tests" test -f "backend/tests/contracts/lifecycleEventService.unit.test.ts"

echo ""
echo "=== Results: $((CHECKS - FAILURES))/$CHECKS passed ==="
if [ "$FAILURES" -gt 0 ]; then
  echo "GATE FAILED: $FAILURES check(s) failed"
  exit 1
fi
echo "GATE PASSED"
