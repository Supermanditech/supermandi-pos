#!/bin/bash
# RCAT-DEPLOY-001: Retailer Admin Routing Smoke Test
# Tests all retailer-admin endpoints to verify gateway routing is working
#
# Usage: ./retailer_admin_routing_smoke.sh [GATEWAY_URL] [AUTH_TOKEN]
# Example: ./retailer_admin_routing_smoke.sh http://34.14.220.171:3000
# Example with token: ./retailer_admin_routing_smoke.sh http://34.14.220.171:3000 "eyJhbG..."

set -e

GATEWAY_URL="${1:-http://localhost:3000}"
AUTH_TOKEN="${2:-}"
PASSED=0
FAILED=0
SKIPPED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=============================================="
echo "RCAT-DEPLOY-001: Retailer Admin Routing Smoke"
echo "=============================================="
echo "Gateway URL: $GATEWAY_URL"
echo "Auth Token: ${AUTH_TOKEN:+[PROVIDED]}${AUTH_TOKEN:-[NOT PROVIDED]}"
echo ""

# Function to test an endpoint
test_endpoint() {
    local method="$1"
    local path="$2"
    local expected_code="$3"
    local description="$4"
    local auth_required="${5:-false}"
    local data="${6:-}"

    local full_url="${GATEWAY_URL}${path}"
    local auth_header=""

    if [ "$auth_required" = "true" ]; then
        if [ -z "$AUTH_TOKEN" ]; then
            echo -e "${YELLOW}SKIP${NC} [$method] $path - $description (no token)"
            ((SKIPPED++))
            return
        fi
        auth_header="-H \"Authorization: Bearer $AUTH_TOKEN\""
    fi

    local data_arg=""
    if [ -n "$data" ]; then
        data_arg="-d '$data'"
    fi

    # Build curl command
    local curl_cmd="curl -s -w '%{http_code}' -o /tmp/smoke_response.txt -X $method"
    if [ -n "$auth_header" ]; then
        curl_cmd="$curl_cmd $auth_header"
    fi
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi
    curl_cmd="$curl_cmd '$full_url'"

    # Execute curl
    local http_code=$(eval $curl_cmd)
    local response=$(cat /tmp/smoke_response.txt 2>/dev/null || echo "")

    if [ "$http_code" = "$expected_code" ]; then
        echo -e "${GREEN}PASS${NC} [$method] $path -> $http_code - $description"
        ((PASSED++))
    else
        echo -e "${RED}FAIL${NC} [$method] $path -> $http_code (expected $expected_code) - $description"
        echo "       Response: ${response:0:100}"
        ((FAILED++))
    fi
}

echo "--- PUBLIC ENDPOINTS (no auth) ---"

# Health endpoints
test_endpoint "GET" "/health" "200" "Gateway health"
test_endpoint "GET" "/api/v1/retailer-admin/health" "200" "Retailer-admin health (RCAT-DEPLOY-001)"

echo ""
echo "--- PROTECTED ENDPOINTS WITHOUT TOKEN (expect 401) ---"

# These should return 401 without a valid token
test_endpoint "GET" "/api/v1/retailer-admin/store" "401" "Store endpoint requires auth"
test_endpoint "GET" "/api/v1/retailer-admin/products" "401" "Products endpoint requires auth"
test_endpoint "GET" "/api/v1/retailer-admin/suppliers" "401" "Suppliers endpoint requires auth"
test_endpoint "GET" "/api/v1/retailer-admin/inventory" "401" "Inventory endpoint requires auth"
test_endpoint "GET" "/api/v1/retailer-admin/categories" "401" "Categories endpoint requires auth"
test_endpoint "GET" "/api/v1/retailer-admin/daily-summary" "401" "Daily summary requires auth"
test_endpoint "GET" "/api/v1/retailer-admin/inventory/ledger" "401" "Ledger endpoint requires auth"
test_endpoint "GET" "/api/v1/retailer-admin/imports" "401" "Imports endpoint requires auth"

echo ""
echo "--- AUTH ENDPOINTS (public login) ---"

# Firebase login should return 401 with invalid token (not 404)
test_endpoint "POST" "/api/v1/retailer-admin/auth/firebase-login" "401" "Firebase login validates token" "false" '{"idToken":"invalid","storeCode":"DEMO001"}'

echo ""
echo "--- PROTECTED ENDPOINTS WITH TOKEN (expect 200) ---"

# These require a valid token
test_endpoint "GET" "/api/v1/retailer-admin/store" "200" "Store endpoint" "true"
test_endpoint "GET" "/api/v1/retailer-admin/products" "200" "Products list" "true"
test_endpoint "GET" "/api/v1/retailer-admin/suppliers" "200" "Suppliers list" "true"
test_endpoint "GET" "/api/v1/retailer-admin/inventory" "200" "Inventory overview" "true"
test_endpoint "GET" "/api/v1/retailer-admin/categories" "200" "Categories list" "true"
test_endpoint "GET" "/api/v1/retailer-admin/daily-summary" "200" "Daily summary" "true"
test_endpoint "GET" "/api/v1/retailer-admin/inventory/ledger" "200" "Inventory ledger" "true"
test_endpoint "GET" "/api/v1/retailer-admin/imports" "200" "CSV imports list" "true"
test_endpoint "GET" "/api/v1/retailer-admin/auth/me" "200" "Current user info" "true"

echo ""
echo "=============================================="
echo "SMOKE TEST SUMMARY"
echo "=============================================="
echo -e "${GREEN}PASSED: $PASSED${NC}"
echo -e "${RED}FAILED: $FAILED${NC}"
echo -e "${YELLOW}SKIPPED: $SKIPPED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}SMOKE TEST FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}SMOKE TEST PASSED${NC}"
    exit 0
fi
