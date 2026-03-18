#!/usr/bin/env bash
# V3-HARDEN-166: Release gate for store-demand visibility and supplier-trigger orchestration
set -euo pipefail

echo "=== Demand Signal & Allocation Gate (V3-HARDEN-166) ==="

FAILURES=0

echo -n "  [1/4] Migration 198 (demand/allocation schema)... "
if [ -f "backend/migrations/198_demand_signal_and_allocation.sql" ]; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [2/4] Store demand signal service... "
if [ -f "backend/src/services/storeDemandSignal.ts" ]; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [3/4] Lifecycle communication rules defined... "
if grep -q "LIFECYCLE_COMMUNICATION_RULES" backend/src/services/storeDemandSignal.ts 2>/dev/null; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo -n "  [4/4] Allocation status CHECK constraint... "
if grep -q "chk_allocation_status" backend/migrations/198_demand_signal_and_allocation.sql 2>/dev/null; then echo "OK"; else echo "FAIL"; FAILURES=$((FAILURES + 1)); fi

echo ""
if [ "$FAILURES" -gt 0 ]; then echo "GATE FAILED: $FAILURES check(s)"; exit 1; fi
echo "GATE PASSED"
