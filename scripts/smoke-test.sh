#!/bin/bash
# =============================================================================
# GL-AUD-006: Go-Live Smoke Test Script
#
# This script validates critical POS and admin endpoints are working.
# Uses the stable demo device tokens from GL-AUD-005.
#
# Usage:
#   ./scripts/smoke-test.sh                    # Test localhost
#   ./scripts/smoke-test.sh http://34.14.220.171:3000  # Test VM
#
# Exit codes:
#   0 = All tests passed
#   1 = One or more tests failed
# =============================================================================

set -e

# Configuration
BASE_URL="${1:-http://localhost:3000}"
DEMO_TOKEN="demo-smoke-test-token-001"
DEMO_TOKEN_2="demo-smoke-test-token-002"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
TOTAL=0

# Helper function to test an endpoint
test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local expected_status="$4"
  local headers="$5"
  local data="$6"

  TOTAL=$((TOTAL + 1))

  # Build curl command
  local curl_cmd="curl -s -w '%{http_code}' -o /tmp/smoke_response.txt -X $method"
  curl_cmd="$curl_cmd '$BASE_URL$endpoint'"

  if [ -n "$headers" ]; then
    curl_cmd="$curl_cmd $headers"
  fi

  if [ -n "$data" ]; then
    curl_cmd="$curl_cmd -d '$data'"
  fi

  # Execute and get status code
  local status_code=$(eval $curl_cmd 2>/dev/null)

  # Check result
  if [ "$status_code" = "$expected_status" ]; then
    echo -e "${GREEN}PASS${NC} [$status_code] $name"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}FAIL${NC} [$status_code != $expected_status] $name"
    echo "       Response: $(cat /tmp/smoke_response.txt 2>/dev/null | head -c 200)"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

echo "========================================"
echo "SuperMandi Go-Live Smoke Test"
echo "========================================"
echo "Target: $BASE_URL"
echo "Demo Token: $DEMO_TOKEN"
echo "========================================"
echo ""

# =============================================================================
# 1. HEALTH ENDPOINTS
# =============================================================================
echo "--- Health Endpoints ---"

test_endpoint \
  "Gateway Health" \
  "GET" \
  "/health" \
  "200"

test_endpoint \
  "Admin Health" \
  "GET" \
  "/api/v1/admin/health" \
  "200"

test_endpoint \
  "Webhook Health" \
  "GET" \
  "/api/v1/webhooks/health" \
  "200"

echo ""

# =============================================================================
# 2. POS ENDPOINTS (using demo device token)
# =============================================================================
echo "--- POS Endpoints ---"

test_endpoint \
  "POS UI Status" \
  "GET" \
  "/api/v1/pos/ui-status" \
  "200" \
  "-H 'X-Device-Token: $DEMO_TOKEN' -H 'Content-Type: application/json'"

test_endpoint \
  "POS Store Products" \
  "GET" \
  "/api/v1/pos/store-products" \
  "200" \
  "-H 'X-Device-Token: $DEMO_TOKEN' -H 'Content-Type: application/json'"

test_endpoint \
  "POS Daily Summary" \
  "GET" \
  "/api/v1/pos/daily-summary" \
  "200" \
  "-H 'X-Device-Token: $DEMO_TOKEN' -H 'Content-Type: application/json'"

test_endpoint \
  "POS Suppliers List" \
  "GET" \
  "/api/v1/pos/suppliers" \
  "200" \
  "-H 'X-Device-Token: $DEMO_TOKEN' -H 'Content-Type: application/json'"

echo ""

# =============================================================================
# 3. AUTH ENDPOINTS (expect 401 without credentials)
# =============================================================================
echo "--- Auth Endpoints ---"

test_endpoint \
  "Admin Login (no creds = 401)" \
  "POST" \
  "/api/v1/auth/login" \
  "401" \
  "-H 'Content-Type: application/json'" \
  '{"email":"","password":""}'

test_endpoint \
  "Retailer Login (no creds = 401)" \
  "POST" \
  "/api/v1/retailer-admin/auth/login" \
  "401" \
  "-H 'Content-Type: application/json'" \
  '{"email":"","password":""}'

echo ""

# =============================================================================
# 4. SECONDARY DEVICE TOKEN
# =============================================================================
echo "--- Secondary Device ---"

test_endpoint \
  "Secondary Device UI Status" \
  "GET" \
  "/api/v1/pos/ui-status" \
  "200" \
  "-H 'X-Device-Token: $DEMO_TOKEN_2' -H 'Content-Type: application/json'"

echo ""

# =============================================================================
# 5. ERROR HANDLING
# =============================================================================
echo "--- Error Handling ---"

test_endpoint \
  "Invalid Device Token (401)" \
  "GET" \
  "/api/v1/pos/ui-status" \
  "401" \
  "-H 'X-Device-Token: invalid-token' -H 'Content-Type: application/json'"

test_endpoint \
  "Non-existent Route (404)" \
  "GET" \
  "/api/v1/does-not-exist" \
  "404"

echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "========================================"
echo "SMOKE TEST SUMMARY"
echo "========================================"
echo -e "Total:  $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "========================================"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "${RED}SOME TESTS FAILED${NC}"
  exit 1
fi
