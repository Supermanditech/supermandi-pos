#!/bin/bash
# =============================================================================
# Gateway API Verification Script
# Tests all POS app API endpoints against the gateway
# =============================================================================

set -e

# Configuration
GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
DEVICE_TOKEN="${DEVICE_TOKEN:-tok_glt4vk4ermcmke1x6jj}"
STORE_ID="${STORE_ID:-}"  # Will be fetched from ui-status if not provided

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# =============================================================================
# Helper Functions
# =============================================================================

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((SKIPPED++))
}

log_info() {
    echo -e "[INFO] $1"
}

# Test an endpoint
# Args: $1=name, $2=method, $3=path, $4=expected_status (default 200)
test_endpoint() {
    local name="$1"
    local method="${2:-GET}"
    local path="$3"
    local expected="${4:-200}"
    local body="$5"

    local url="${GATEWAY_URL}${path}"
    local curl_args=(-s -o /tmp/response.json -w "%{http_code}" -H "x-device-token: ${DEVICE_TOKEN}")

    if [ "$method" = "POST" ] || [ "$method" = "PATCH" ]; then
        curl_args+=(-X "$method" -H "Content-Type: application/json")
        if [ -n "$body" ]; then
            curl_args+=(-d "$body")
        fi
    fi

    local status=$(curl "${curl_args[@]}" "$url")

    if [ "$status" = "$expected" ]; then
        log_pass "$name (HTTP $status)"
        return 0
    else
        log_fail "$name (HTTP $status, expected $expected)"
        echo "  Response: $(cat /tmp/response.json | head -c 200)"
        return 1
    fi
}

# =============================================================================
# Main Tests
# =============================================================================

echo "========================================"
echo "Gateway API Verification"
echo "========================================"
echo "Gateway URL: ${GATEWAY_URL}"
echo "Device Token: ${DEVICE_TOKEN}"
echo ""

# -----------------------------------------------------------------------------
# Phase 1: Core POS APIs
# -----------------------------------------------------------------------------
echo ""
echo "--- Phase 1: Core POS APIs ---"

# Test UI Status (gets store info)
if test_endpoint "UI Status" GET "/api/v1/pos/ui-status"; then
    # Extract store ID if not provided
    if [ -z "$STORE_ID" ]; then
        STORE_ID=$(cat /tmp/response.json | grep -o '"storeId":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$STORE_ID" ]; then
            log_info "Extracted Store ID: ${STORE_ID}"
        else
            log_fail "Could not extract store ID from ui-status"
        fi
    fi
fi

# Test Bills List
test_endpoint "List Bills" GET "/api/v1/pos/bills"

# Test Bill Detail (will fail if no bills exist - that's expected)
test_endpoint "Bill Detail (no data)" GET "/api/v1/pos/bills/nonexistent" "404" || true

# -----------------------------------------------------------------------------
# Phase 2: Catalog APIs
# -----------------------------------------------------------------------------
echo ""
echo "--- Phase 2: Catalog APIs ---"

if [ -n "$STORE_ID" ]; then
    test_endpoint "Catalog List" GET "/api/v1/catalog/stores/${STORE_ID}/catalog"
    test_endpoint "Catalog Categories" GET "/api/v1/catalog/stores/${STORE_ID}/catalog/categories"
    test_endpoint "Catalog Search" GET "/api/v1/catalog/stores/${STORE_ID}/catalog?q=test"
else
    log_skip "Catalog APIs (no store ID)"
    ((SKIPPED+=3))
fi

# -----------------------------------------------------------------------------
# Phase 3: Orders APIs
# -----------------------------------------------------------------------------
echo ""
echo "--- Phase 3: Orders APIs ---"

if [ -n "$STORE_ID" ]; then
    test_endpoint "Orders List" GET "/api/v1/orders/stores/${STORE_ID}/orders"
    test_endpoint "Orders Filtered" GET "/api/v1/orders/stores/${STORE_ID}/orders?status=submitted,confirmed"
else
    log_skip "Orders APIs (no store ID)"
    ((SKIPPED+=2))
fi

# -----------------------------------------------------------------------------
# Phase 4: Reorder APIs
# -----------------------------------------------------------------------------
echo ""
echo "--- Phase 4: Reorder APIs ---"

if [ -n "$STORE_ID" ]; then
    test_endpoint "Reorder Pending" GET "/api/v1/reorder/stores/${STORE_ID}/reorder/pending"
    test_endpoint "Reorder Settings" GET "/api/v1/reorder/stores/${STORE_ID}/reorder/settings"
    test_endpoint "Reorder Policies" GET "/api/v1/reorder/stores/${STORE_ID}/reorder/policies"
else
    log_skip "Reorder APIs (no store ID)"
    ((SKIPPED+=3))
fi

# -----------------------------------------------------------------------------
# Phase 5: Inventory APIs
# -----------------------------------------------------------------------------
echo ""
echo "--- Phase 5: Inventory APIs ---"

if [ -n "$STORE_ID" ]; then
    test_endpoint "Purchase History" GET "/api/v1/inventory/stores/${STORE_ID}/ledger?type=GRN,INWARD"
    test_endpoint "Sales History" GET "/api/v1/inventory/stores/${STORE_ID}/ledger?type=SALE"
else
    log_skip "Inventory APIs (no store ID)"
    ((SKIPPED+=2))
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "========================================"
echo "Summary"
echo "========================================"
echo -e "${GREEN}Passed:${NC} ${PASSED}"
echo -e "${RED}Failed:${NC} ${FAILED}"
echo -e "${YELLOW}Skipped:${NC} ${SKIPPED}"
echo ""

TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
    PERCENT=$((PASSED * 100 / TOTAL))
    echo "Success Rate: ${PERCENT}%"
fi

if [ $FAILED -gt 0 ]; then
    echo ""
    echo -e "${RED}Some tests failed. Check the output above.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}All tests passed!${NC}"
exit 0
