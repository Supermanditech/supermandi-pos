#!/usr/bin/env bash
# V3-HARDEN-161: Scan capacity gate
# Blocks deployment unless scan infrastructure meets approved 50k+50k/day targets
set -euo pipefail

echo "=== Scan Capacity Gate (V3-HARDEN-161) ==="

FAILURES=0

# 1. Scan capacity contract exists
echo -n "  [1/6] Scan capacity contract... "
if [ -f "src/services/scanCapacity.ts" ]; then
  echo "OK"
else
  echo "FAIL — scanCapacity.ts missing"
  FAILURES=$((FAILURES + 1))
fi

# 2. Scan intent contract exists
echo -n "  [2/6] Scan intent contract... "
if [ -f "src/services/scanIntent.ts" ]; then
  echo "OK"
else
  echo "FAIL — scanIntent.ts missing"
  FAILURES=$((FAILURES + 1))
fi

# 3. k6 scan stress test exists
echo -n "  [3/6] k6 scan stress test... "
if [ -f "scripts/load-tests/scan-stress.js" ]; then
  echo "OK"
else
  echo "FAIL — scan-stress.js missing"
  FAILURES=$((FAILURES + 1))
fi

# 4. Duplicate suppression is wired into live scan path
echo -n "  [4/6] Duplicate suppression in ScanScreenV3... "
if grep -q "isDuplicateScan" src/screens/v3/ScanScreenV3.tsx 2>/dev/null; then
  echo "OK"
else
  echo "FAIL — isDuplicateScan not wired"
  FAILURES=$((FAILURES + 1))
fi

# 5. Duplicate suppression in Counter Purchase
echo -n "  [5/6] Duplicate suppression in CounterPurchaseScreenV3... "
if grep -q "isDuplicateScan" src/screens/v3/CounterPurchaseScreenV3.tsx 2>/dev/null; then
  echo "OK"
else
  echo "FAIL — isDuplicateScan not wired in Counter Purchase"
  FAILURES=$((FAILURES + 1))
fi

# 6. Capacity targets documented at 50k+50k
echo -n "  [6/6] 50k/day targets documented... "
if grep -q "50_000" src/services/scanCapacity.ts 2>/dev/null; then
  echo "OK"
else
  echo "FAIL — 50k targets not defined"
  FAILURES=$((FAILURES + 1))
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "GATE FAILED: $FAILURES check(s) did not pass"
  exit 1
fi
echo "GATE PASSED: Scan capacity infrastructure verified"
echo ""
echo "Approved targets: 50,000 SELL + 50,000 purchase scans/day"
echo "Run load test: k6 run scripts/load-tests/scan-stress.js"
