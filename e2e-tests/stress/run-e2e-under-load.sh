#!/usr/bin/env bash
# TEST-049: Full E2E Under Background Load
#
# Runs Playwright E2E tests while k6 generates background API traffic.
# Validates that the application functions correctly under realistic load.
#
# Prerequisites:
#   1. k6 installed (https://k6.io/docs/get-started/installation/)
#   2. Backend services running
#   3. AUTH_TOKEN set for API access
#
# Usage:
#   BASE_URL=https://staging.supermandi.tech \
#   AUTH_TOKEN=<jwt> \
#     bash e2e-tests/stress/run-e2e-under-load.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

BASE_URL="${BASE_URL:-https://staging.supermandi.tech}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

echo "=============================================="
echo "TEST-049: E2E Under Background Load"
echo "=============================================="
echo "Base URL: $BASE_URL"
echo ""

# Step 1: Start background load (k6)
echo "[1/4] Starting background load generator..."
k6 run \
  --env "BASE_URL=$BASE_URL" \
  --env "AUTH_TOKEN=$AUTH_TOKEN" \
  --duration 15m \
  --out json="$RESULTS_DIR/background-load.json" \
  "$SCRIPT_DIR/k6/background-load.js" \
  > "$RESULTS_DIR/background-load.log" 2>&1 &

K6_PID=$!
echo "  k6 PID: $K6_PID"
echo "  Waiting 30s for load to stabilize..."
sleep 30

# Step 2: Run Playwright E2E tests
echo ""
echo "[2/4] Running Playwright E2E tests under load..."
cd "$PROJECT_ROOT/e2e-tests"

PLAYWRIGHT_EXIT=0
STAGING=true npx playwright test \
  --grep @prod \
  --reporter=json \
  --output "$RESULTS_DIR/e2e-under-load-results" \
  2>&1 | tee "$RESULTS_DIR/e2e-under-load.log" || PLAYWRIGHT_EXIT=$?

# Step 3: Stop background load
echo ""
echo "[3/4] Stopping background load..."
if kill -0 $K6_PID 2>/dev/null; then
  kill -SIGINT $K6_PID || true
  wait $K6_PID 2>/dev/null || true
  echo "  k6 stopped"
else
  echo "  k6 already exited"
fi

# Step 4: Analyze results
echo ""
echo "[4/4] Results Summary"
echo "=============================================="

if [ -f "$RESULTS_DIR/background-load.log" ]; then
  echo ""
  echo "--- Background Load (k6) ---"
  tail -20 "$RESULTS_DIR/background-load.log"
fi

echo ""
echo "--- Playwright E2E ---"
if [ "$PLAYWRIGHT_EXIT" -eq 0 ]; then
  echo "  RESULT: PASS — E2E tests passed under background load"
else
  echo "  RESULT: FAIL — E2E tests failed under load (exit code: $PLAYWRIGHT_EXIT)"
  echo "  See: $RESULTS_DIR/e2e-under-load.log"
fi

echo ""
echo "=============================================="
if [ "$PLAYWRIGHT_EXIT" -eq 0 ]; then
  echo "TEST-049: PASS"
  exit 0
else
  echo "TEST-049: FAIL"
  exit 1
fi
