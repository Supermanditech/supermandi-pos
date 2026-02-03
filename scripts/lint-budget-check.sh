#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# LINT BUDGET CHECK
# ═══════════════════════════════════════════════════════════════════════════════
#
# Checks that ESLint warning counts don't exceed the budgets defined in
# .lint-baseline.json. This prevents "warning creep" where new warnings
# accumulate over time.
#
# Usage:
#   ./scripts/lint-budget-check.sh
#
# Exit codes:
#   0 - All packages within budget
#   1 - One or more packages exceeded budget
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BASELINE_FILE="$ROOT_DIR/.lint-baseline.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "LINT BUDGET CHECK"
echo "════════════════════════════════════════════════════════════════════"
echo ""

if [ ! -f "$BASELINE_FILE" ]; then
    echo -e "${RED}ERROR: $BASELINE_FILE not found${NC}"
    exit 1
fi

FAILED=0

# Function to count warnings from lint output
count_warnings() {
    local output="$1"
    # Extract warning count from "X problems (Y errors, Z warnings)" or "X warnings"
    local count=$(echo "$output" | grep -oP '\d+(?= warning)' | tail -1)
    echo "${count:-0}"
}

# Function to get budget from baseline file
get_budget() {
    local package="$1"
    local budget=$(cat "$BASELINE_FILE" | grep -A1 "\"$package\":" | grep -oP '\d+' | head -1)
    echo "${budget:-0}"
}

# Check supermandi-superadmin
echo "Checking supermandi-superadmin..."
BUDGET=$(get_budget "supermandi-superadmin")
if [ -d "$ROOT_DIR/supermandi-superadmin" ] && [ -f "$ROOT_DIR/supermandi-superadmin/package.json" ]; then
    cd "$ROOT_DIR/supermandi-superadmin"
    OUTPUT=$(npm run lint 2>&1 || true)
    COUNT=$(count_warnings "$OUTPUT")

    if [ "$COUNT" -gt "$BUDGET" ]; then
        echo -e "  ${RED}FAIL: $COUNT warnings (budget: $BUDGET)${NC}"
        FAILED=1
    else
        echo -e "  ${GREEN}PASS: $COUNT warnings (budget: $BUDGET)${NC}"
    fi
else
    echo -e "  ${YELLOW}SKIP: directory not found${NC}"
fi

# Check backend
echo "Checking backend..."
BUDGET=$(get_budget "backend")
if [ -d "$ROOT_DIR/backend" ] && [ -f "$ROOT_DIR/backend/package.json" ]; then
    cd "$ROOT_DIR/backend"
    OUTPUT=$(npm run lint 2>&1 || true)
    COUNT=$(count_warnings "$OUTPUT")

    if [ "$COUNT" -gt "$BUDGET" ]; then
        echo -e "  ${RED}FAIL: $COUNT warnings (budget: $BUDGET)${NC}"
        FAILED=1
    else
        echo -e "  ${GREEN}PASS: $COUNT warnings (budget: $BUDGET)${NC}"
    fi
else
    echo -e "  ${YELLOW}SKIP: directory not found${NC}"
fi

# Check retailer-admin (may not have lint configured)
echo "Checking retailer-admin..."
BUDGET=$(get_budget "retailer-admin")
if [ -d "$ROOT_DIR/retailer-admin" ] && [ -f "$ROOT_DIR/retailer-admin/package.json" ]; then
    cd "$ROOT_DIR/retailer-admin"
    if npm run lint --if-present 2>&1 | grep -q "Missing script"; then
        echo -e "  ${YELLOW}SKIP: no lint script${NC}"
    else
        OUTPUT=$(npm run lint 2>&1 || true)
        COUNT=$(count_warnings "$OUTPUT")

        if [ "$COUNT" -gt "$BUDGET" ]; then
            echo -e "  ${RED}FAIL: $COUNT warnings (budget: $BUDGET)${NC}"
            FAILED=1
        else
            echo -e "  ${GREEN}PASS: $COUNT warnings (budget: $BUDGET)${NC}"
        fi
    fi
else
    echo -e "  ${YELLOW}SKIP: directory not found${NC}"
fi

# Check supplier-portal (may not have lint configured)
echo "Checking supplier-portal..."
BUDGET=$(get_budget "supplier-portal")
if [ -d "$ROOT_DIR/supplier-portal" ] && [ -f "$ROOT_DIR/supplier-portal/package.json" ]; then
    cd "$ROOT_DIR/supplier-portal"
    if npm run lint --if-present 2>&1 | grep -q "Missing script"; then
        echo -e "  ${YELLOW}SKIP: no lint script${NC}"
    else
        OUTPUT=$(npm run lint 2>&1 || true)
        COUNT=$(count_warnings "$OUTPUT")

        if [ "$COUNT" -gt "$BUDGET" ]; then
            echo -e "  ${RED}FAIL: $COUNT warnings (budget: $BUDGET)${NC}"
            FAILED=1
        else
            echo -e "  ${GREEN}PASS: $COUNT warnings (budget: $BUDGET)${NC}"
        fi
    fi
else
    echo -e "  ${YELLOW}SKIP: directory not found${NC}"
fi

echo ""
echo "════════════════════════════════════════════════════════════════════"

if [ $FAILED -eq 1 ]; then
    echo -e "${RED}LINT BUDGET CHECK FAILED${NC}"
    echo ""
    echo "One or more packages exceeded their warning budget."
    echo "Either fix the warnings or update .lint-baseline.json"
    echo "(but only increase budgets with team approval)."
    exit 1
else
    echo -e "${GREEN}LINT BUDGET CHECK PASSED${NC}"
    echo ""
    echo "All packages are within their warning budgets."
    exit 0
fi
