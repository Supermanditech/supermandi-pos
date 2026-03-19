#!/usr/bin/env bash
# V3-HARDEN-166 + V3-HARDEN-185: Release gate for demand signal compute + API + allocation
set -euo pipefail

echo "=== Demand Signal & Allocation Gate (V3-HARDEN-166 + V3-HARDEN-185) ==="

FAILURES=0

echo -n "  [1/8] Migration 198 (demand/allocation schema)... "
if [ -f "backend/migrations/198_demand_signal_and_allocation.sql" ]; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [2/8] Store demand signal types... "
if [ -f "backend/src/services/storeDemandSignal.ts" ]; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [3/8] Lifecycle communication rules defined... "
if grep -q "LIFECYCLE_COMMUNICATION_RULES" backend/src/services/storeDemandSignal.ts 2>/dev/null; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [4/8] Allocation status CHECK constraint... "
if grep -q "chk_allocation_status" backend/migrations/198_demand_signal_and_allocation.sql 2>/dev/null; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [5/8] Demand signal compute service (V3-HARDEN-185)... "
if [ -f "backend/src/services/demandSignalCompute.ts" ] && grep -q "computeStoreDemandSignals" backend/src/services/demandSignalCompute.ts 2>/dev/null; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [6/8] POS demand-signals route (V3-HARDEN-185)... "
if [ -f "backend/src/routes/v1/pos/demandSignals.ts" ] && grep -q '"/demand-signals"' backend/src/routes/v1/pos/demandSignals.ts 2>/dev/null; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [7/8] Retailer-admin demand-signals route (V3-HARDEN-185)... "
if [ -f "backend/src/routes/v1/retailer-admin/demandSignals.ts" ] && grep -q '"/demand-signals"' backend/src/routes/v1/retailer-admin/demandSignals.ts 2>/dev/null; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [8/8] Admin demand-signals route with pressure + recompute (V3-HARDEN-185)... "
if [ -f "backend/src/routes/v1/admin/demandSignals.ts" ] && grep -q "computeCrossStoreDemandPressure" backend/src/routes/v1/admin/demandSignals.ts 2>/dev/null; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo ""
if [ "$FAILURES" -gt 0 ]; then echo "GATE FAILED: $FAILURES check(s)"; exit 1; fi
echo "GATE PASSED"
