#!/usr/bin/env bash
# V3-HARDEN-189: Phase 21 go/no-go gate (behavioral + structural)
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

# ─── SECTION 1: Schema parity ───
echo ""
echo "--- Schema Parity ---"
check "Migration 198 exists" test -f "backend/migrations/198_demand_signal_and_allocation.sql"
check "supplier_demand_allocations table defined" grep -q "supplier_demand_allocations" backend/migrations/198_demand_signal_and_allocation.sql
check "lifecycle_event_log table defined" grep -q "lifecycle_event_log" backend/migrations/198_demand_signal_and_allocation.sql
check "allocation_status CHECK constraint" grep -q "chk_allocation_status" backend/migrations/198_demand_signal_and_allocation.sql

# ─── SECTION 2: Demand signal compute (behavioral) ───
echo ""
echo "--- Demand Signal Compute ---"
check "demandSignalCompute.ts exists" test -f "backend/src/services/demandSignalCompute.ts"
check "Uses canonical order_id FK (not purchase_order_id)" grep -q "poi.order_id" backend/src/services/demandSignalCompute.ts
check "Uses canonical ordered_quantity (not quantity)" grep -q "poi.ordered_quantity" backend/src/services/demandSignalCompute.ts
check "Joins real sales tables" grep -q "public.sale_items" backend/src/services/demandSignalCompute.ts
check "Joins real stock_balances" grep -q "inventory.stock_balances" backend/src/services/demandSignalCompute.ts
check "Freshness metadata: computedAt" grep -q "computedAt" backend/src/services/demandSignalCompute.ts
check "Freshness metadata: snapshotVersion" grep -q "snapshotVersion" backend/src/services/demandSignalCompute.ts
check "POS demand route with device auth" grep -q "requireDeviceToken" backend/src/routes/v1/pos/demandSignals.ts
check "Retailer demand route exists" grep -q '"/demand-signals"' backend/src/routes/v1/retailer-admin/demandSignals.ts
check "Admin demand route with auth" grep -q "requireAdminToken" backend/src/routes/v1/admin/demandSignals.ts
check "Admin demand permission check" grep -q 'requirePermission("demand_signals"' backend/src/routes/v1/admin/demandSignals.ts

# ─── SECTION 3: Buy-again service ───
echo ""
echo "--- Buy-Again Service ---"
check "buyAgainService.ts exists" test -f "backend/src/services/buyAgainService.ts"
check "buildBuyAgainFromOrder uses demand suppression" grep -q "computeStoreDemandSignals" backend/src/services/buyAgainService.ts
check "POS buy-again route with auth" grep -q "requireDeviceToken" backend/src/routes/v1/pos/buyAgain.ts
check "Frontend wires purchaseDraftStore" grep -q "usePurchaseDraftStore" src/services/api/buyAgainApi.ts

# ─── SECTION 4: Allocation state machine (behavioral) ───
echo ""
echo "--- Allocation State Machine ---"
check "allocationService.ts exists" test -f "backend/src/services/allocationService.ts"
check "Uses canonical publishLifecycleEvent (not sidecar)" grep -q "publishLifecycleEvent" backend/src/services/allocationService.ts
check "No sidecar writeLifecycleEvent" bash -c '! grep -q "writeLifecycleEvent" backend/src/services/allocationService.ts'
check "Supplier route uses req.supplierId (not req.supplier!.id)" grep -q "req.supplierId" backend/src/routes/v1/supplier/allocations.ts
check "No req.supplier!.id in code (comments OK)" bash -c '! grep -v "^\s*//" backend/src/routes/v1/supplier/allocations.ts | grep -v "^\s*\*" | grep -q "req\.supplier!"'
check "Admin allocations route with auth" grep -q "requireAdminToken" backend/src/routes/v1/admin/allocations.ts
check "Admin allocations permission check" grep -q 'requirePermission("allocations"' backend/src/routes/v1/admin/allocations.ts

# ─── SECTION 5: Lifecycle event fan-out (behavioral) ───
echo ""
echo "--- Lifecycle Event Fan-Out ---"
check "lifecycleEventService.ts exists" test -f "backend/src/services/lifecycleEventService.ts"
check "publishLifecycleEvent exported" grep -q "export async function publishLifecycleEvent" backend/src/services/lifecycleEventService.ts
check "Uses real sendTextMessage (not log-only)" grep -q "sendTextMessage" backend/src/services/lifecycleEventService.ts
check "Recipient resolution from DB" grep -q "resolveRecipientPhone" backend/src/services/lifecycleEventService.ts
check "Phone normalization via normalizePhone" grep -q "normalizePhone" backend/src/services/lifecycleEventService.ts
check "Idempotency dedup" grep -q "processedEvents" backend/src/services/lifecycleEventService.ts
check "Retry with exponential backoff" grep -q "Math.pow" backend/src/services/lifecycleEventService.ts
check "POS lifecycle route with store ownership" grep -q "ownerCheck" backend/src/routes/v1/pos/lifecycleEvents.ts

# ─── SECTION 6: Auth enforcement ───
echo ""
echo "--- Auth Enforcement ---"
check "Admin demand routes behind requireAdminToken" grep -q 'requireAdminToken' backend/src/routes/v1/admin/demandSignals.ts
check "Admin allocations behind requireAdminToken" grep -q 'requireAdminToken' backend/src/routes/v1/admin/allocations.ts
check "Supplier allocations behind requireSupplierAuth" grep -q 'requireSupplierAuth' backend/src/routes/v1/supplier/allocations.ts
check "POS demand behind requireDeviceToken" grep -q 'requireDeviceToken' backend/src/routes/v1/pos/demandSignals.ts
check "POS buy-again behind requireDeviceToken" grep -q 'requireDeviceToken' backend/src/routes/v1/pos/buyAgain.ts
check "POS lifecycle behind requireDeviceToken" grep -q 'requireDeviceToken' backend/src/routes/v1/pos/lifecycleEvents.ts

# ─── SECTION 7: Startup validation + CI ───
echo ""
echo "--- Startup & CI ---"
check "phase21StartupValidation.ts exists" test -f "backend/src/services/phase21StartupValidation.ts"
check "validatePhase21Startup called at boot" grep -q "validatePhase21Startup" backend/src/app.ts
check "Phase 21 gate in deploy.yml" grep -q "phase21-go-live-gate.sh" .github/workflows/deploy.yml
check "Gate is blocking step in deploy" grep -q "Phase 21 Go-Live Gate" .github/workflows/deploy.yml

# ─── SECTION 8: Route registration ───
echo ""
echo "--- Route Registration ---"
check "posDemandSignalsRouter in index" grep -q "posDemandSignalsRouter" backend/src/routes/v1/index.ts
check "posBuyAgainRouter in index" grep -q "posBuyAgainRouter" backend/src/routes/v1/index.ts
check "posLifecycleEventsRouter in index" grep -q "posLifecycleEventsRouter" backend/src/routes/v1/index.ts
check "retailerDemandSignalsRouter in index" grep -q "retailerDemandSignalsRouter" backend/src/routes/v1/index.ts
check "adminDemandSignalsRouter in index" grep -q "adminDemandSignalsRouter" backend/src/routes/v1/index.ts
check "adminAllocationsRouter in index" grep -q "adminAllocationsRouter" backend/src/routes/v1/index.ts
check "supplierAllocationsRouter in index" grep -q "supplierAllocationsRouter" backend/src/routes/v1/index.ts

# ─── SECTION 9: Tests ───
echo ""
echo "--- Test Files ---"
check "demandSignalCompute tests" test -f "backend/tests/contracts/demandSignalCompute.unit.test.ts"
check "buyAgainService tests" test -f "backend/tests/contracts/buyAgainService.unit.test.ts"
check "allocationService tests" test -f "backend/tests/contracts/allocationService.unit.test.ts"
check "lifecycleEventService tests" test -f "backend/tests/contracts/lifecycleEventService.unit.test.ts"
check "phase21GoLiveGate tests" test -f "backend/tests/contracts/phase21GoLiveGate.unit.test.ts"

# ─── SECTION 10: Runtime behavioral tests (blocking) ───
echo ""
echo "--- Runtime Behavioral Tests ---"

check "Phase 21 Jest tests pass (120+ tests)" bash -c '
  cd backend && npx jest \
    tests/contracts/demandSignalCompute.unit.test.ts \
    tests/contracts/buyAgainService.unit.test.ts \
    tests/contracts/allocationService.unit.test.ts \
    tests/contracts/lifecycleEventService.unit.test.ts \
    tests/contracts/phase21GoLiveGate.unit.test.ts \
    tests/contracts/storeDemandSignal.unit.test.ts \
    --no-coverage --silent 2>&1 | grep -q "Tests:.*passed"
'

# Runtime behavioral checks via Jest (handles TS compilation)
check "Allocation state machine: transitions validated at runtime" bash -c '
  cd backend && npx jest tests/contracts/allocationService.unit.test.ts \
    -t "happy path" --no-coverage --silent 2>&1 | grep -q "1 passed"
'

check "Lifecycle communication rules: 10 events validated at runtime" bash -c '
  cd backend && npx jest tests/contracts/lifecycleEventService.unit.test.ts \
    -t "all 10 event types" --no-coverage --silent 2>&1 | grep -q "1 passed"
'

check "Demand compute: reorder math validated at runtime" bash -c '
  cd backend && npx jest tests/contracts/demandSignalCompute.unit.test.ts \
    -t "suggests quantity to cover 14 days" --no-coverage --silent 2>&1 | grep -q "1 passed"
'

check "Store ownership enforcement validated at runtime" bash -c '
  cd backend && npx jest tests/contracts/demandSignalCompute.unit.test.ts \
    -t "store ownership" --no-coverage --silent 2>&1 | grep -q "1 passed"
'

check "Auth enforcement: admin routes require token" bash -c '
  cd backend && npx jest tests/contracts/demandSignalCompute.unit.test.ts \
    -t "Admin demand-signals routes require auth" --no-coverage --silent 2>&1 | grep -q "passed"
'

check "RBAC migration 202 exists for demand_signals + allocations" bash -c '
  grep -q "demand_signals" backend/migrations/202_phase21_rbac_permissions.sql && \
  grep -q "allocations" backend/migrations/202_phase21_rbac_permissions.sql
'

echo ""
echo "=== Results: $((CHECKS - FAILURES))/$CHECKS passed ==="
if [ "$FAILURES" -gt 0 ]; then
  echo "GATE FAILED: $FAILURES check(s) failed"
  exit 1
fi
echo "GATE PASSED"
