#!/usr/bin/env bash
# TEST-039: Run ALL tests against production-scale (100K SKU) database
#
# Prerequisites:
#   1. Database seeded with seed-production-data.ts
#   2. Backend services running against seeded DB
#   3. All test dependencies installed
#
# Usage:
#   bash e2e-tests/stress/run-scale-tests.sh
#
# This script runs ALL existing test suites against the production-scale
# database to verify they pass at scale (not just with 3 demo products).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

log_result() {
  local name="$1"
  local status="$2"
  local detail="${3:-}"

  if [ "$status" = "PASS" ]; then
    echo -e "${GREEN}[PASS]${NC} $name $detail"
    ((PASS++))
  elif [ "$status" = "FAIL" ]; then
    echo -e "${RED}[FAIL]${NC} $name $detail"
    ((FAIL++))
  else
    echo -e "${YELLOW}[SKIP]${NC} $name $detail"
    ((SKIP++))
  fi
}

echo "=============================================="
echo "TEST-039: Scale Test Runner (100K SKU DB)"
echo "=============================================="
echo ""
echo "Running all test suites against production-scale data..."
echo "Results: $RESULTS_DIR/"
echo ""

# -------------------------------------------------------
# 1. Backend Unit + Integration Tests
# -------------------------------------------------------
echo "--- Backend Tests ---"
cd "$PROJECT_ROOT/backend"

if pnpm test 2>&1 | tee "$RESULTS_DIR/backend-tests.log"; then
  log_result "Backend unit/integration" "PASS"
else
  log_result "Backend unit/integration" "FAIL" "(see $RESULTS_DIR/backend-tests.log)"
fi

if pnpm test:contract 2>&1 | tee "$RESULTS_DIR/backend-contracts.log"; then
  log_result "Backend contracts" "PASS"
else
  log_result "Backend contracts" "FAIL" "(see $RESULTS_DIR/backend-contracts.log)"
fi

# -------------------------------------------------------
# 2. POS App Tests (Jest)
# -------------------------------------------------------
echo ""
echo "--- POS App Tests ---"
cd "$PROJECT_ROOT"

if npx jest --config jest.config.js --no-coverage 2>&1 | tee "$RESULTS_DIR/pos-tests.log"; then
  log_result "POS app Jest" "PASS"
else
  log_result "POS app Jest" "FAIL" "(see $RESULTS_DIR/pos-tests.log)"
fi

# -------------------------------------------------------
# 3. Retailer Admin Tests (Vitest)
# -------------------------------------------------------
echo ""
echo "--- Retailer Admin Tests ---"
cd "$PROJECT_ROOT/retailer-admin"

if npx vitest run --no-coverage 2>&1 | tee "$RESULTS_DIR/retailer-tests.log"; then
  log_result "Retailer Admin Vitest" "PASS"
else
  log_result "Retailer Admin Vitest" "FAIL" "(see $RESULTS_DIR/retailer-tests.log)"
fi

# -------------------------------------------------------
# 4. Supplier Portal Tests (Jest)
# -------------------------------------------------------
echo ""
echo "--- Supplier Portal Tests ---"
cd "$PROJECT_ROOT/supplier-portal"

if npx jest --no-coverage 2>&1 | tee "$RESULTS_DIR/supplier-tests.log"; then
  log_result "Supplier Portal Jest" "PASS"
else
  log_result "Supplier Portal Jest" "FAIL" "(see $RESULTS_DIR/supplier-tests.log)"
fi

# -------------------------------------------------------
# 5. SuperAdmin Tests (Vitest)
# -------------------------------------------------------
echo ""
echo "--- SuperAdmin Tests ---"
cd "$PROJECT_ROOT/supermandi-superadmin"

if npx vitest run --no-coverage 2>&1 | tee "$RESULTS_DIR/superadmin-tests.log"; then
  log_result "SuperAdmin Vitest" "PASS"
else
  log_result "SuperAdmin Vitest" "FAIL" "(see $RESULTS_DIR/superadmin-tests.log)"
fi

# -------------------------------------------------------
# 6. Typecheck All Projects
# -------------------------------------------------------
echo ""
echo "--- Typecheck ---"
cd "$PROJECT_ROOT"

for proj in backend retailer-admin supplier-portal supermandi-superadmin; do
  cd "$PROJECT_ROOT/$proj"
  if npx tsc --noEmit 2>&1 | tee "$RESULTS_DIR/typecheck-$proj.log"; then
    log_result "Typecheck $proj" "PASS"
  else
    log_result "Typecheck $proj" "FAIL" "(see $RESULTS_DIR/typecheck-$proj.log)"
  fi
done

# -------------------------------------------------------
# 7. E2E Tests (if staging is available)
# -------------------------------------------------------
echo ""
echo "--- E2E Tests ---"
cd "$PROJECT_ROOT/e2e-tests"

if [ -n "${BASE_URL:-}" ] || [ "${STAGING:-}" = "true" ]; then
  if npx playwright test --grep @prod 2>&1 | tee "$RESULTS_DIR/e2e-prod.log"; then
    log_result "Playwright E2E @prod" "PASS"
  else
    log_result "Playwright E2E @prod" "FAIL" "(see $RESULTS_DIR/e2e-prod.log)"
  fi
else
  log_result "Playwright E2E" "SKIP" "(no BASE_URL or STAGING=true)"
fi

# -------------------------------------------------------
# SUMMARY
# -------------------------------------------------------
echo ""
echo "=============================================="
echo "TEST-039: SCALE TEST SUMMARY"
echo "=============================================="
echo -e "  ${GREEN}PASS${NC}: $PASS"
echo -e "  ${RED}FAIL${NC}: $FAIL"
echo -e "  ${YELLOW}SKIP${NC}: $SKIP"
echo "  TOTAL: $((PASS + FAIL + SKIP))"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}RESULT: FAIL — $FAIL test suite(s) failed at production scale${NC}"
  exit 1
else
  echo -e "${GREEN}RESULT: PASS — All test suites pass at 100K SKU scale${NC}"
  exit 0
fi
