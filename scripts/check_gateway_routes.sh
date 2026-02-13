#!/bin/bash
# GW-001: API Gateway Route Coverage Audit Script
# Checks that all required routes are properly proxied through the gateway

set -e

BASE_URL=${1:-"https://supermandi.tech"}

echo "=============================================="
echo "GW-001: API GATEWAY ROUTE COVERAGE AUDIT"
echo "=============================================="
echo "Target: $BASE_URL"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

# Check if route returns expected status (not 404/502/504)
check_route() {
  local method=$1
  local path=$2
  local description=$3
  local expected_pattern=${4:-"200|201|400|401|403"} # Auth failures are OK, just not 404/502

  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null || echo "000")

  if [[ "$status" =~ $expected_pattern ]]; then
    echo -e "${GREEN}✓${NC} [$method] $path ($status) - $description"
    ((PASS++))
  elif [[ "$status" =~ "404|502|504" ]]; then
    echo -e "${RED}✗${NC} [$method] $path ($status) - $description - GATEWAY MISSING ROUTE"
    ((FAIL++))
  else
    echo -e "${YELLOW}?${NC} [$method] $path ($status) - $description - UNEXPECTED"
    ((WARN++))
  fi
}

echo "=== PUBLIC ROUTES (Should be whitelisted) ==="
# These routes should NOT require auth
check_route "GET" "/api/health" "Main health endpoint" "200"
check_route "POST" "/api/v1/retailer-admin/auth/firebase-login" "Retailer Firebase login" "400|401"
check_route "POST" "/api/v1/supplier/auth/login" "Supplier login" "400|401"
check_route "POST" "/api/v1/supplier/auth/register" "Supplier registration" "400|401"
check_route "POST" "/api/v1/supplier/auth/send-otp" "Supplier OTP send" "400|401"
check_route "POST" "/api/v1/admin/auth/login" "Admin login" "400|401"
check_route "POST" "/api/v1/pos/generate-activation-code" "POS activation code" "400|401"

echo ""
echo "=== HEALTH ENDPOINTS (Should be accessible) ==="
check_route "GET" "/api/v1/admin/health" "Admin health" "200"
check_route "GET" "/api/v1/platform/health" "Platform health" "200"
check_route "GET" "/api/v1/auth/health" "Auth health" "200"
check_route "GET" "/api/v1/inventory/health" "Inventory health" "200"
check_route "GET" "/api/v1/orders/health" "Orders health" "200"
check_route "GET" "/api/v1/catalog/health" "Catalog health" "200"
check_route "GET" "/api/v1/suppliers/health" "Suppliers health" "200"

echo ""
echo "=== PROTECTED ROUTES (Should return 401, not 404) ==="
# POS Routes
check_route "GET" "/api/v1/pos/products" "POS products list" "401"
check_route "POST" "/api/v1/pos/sales" "POS create sale" "401"
check_route "GET" "/api/v1/pos/store" "POS get store" "401"

# Retailer Admin Routes
check_route "GET" "/api/v1/retailer-admin/stores" "Retailer stores" "401"
check_route "POST" "/api/v1/retailer-admin/activate-device" "Device activation" "401"

# Admin Routes
check_route "GET" "/api/v1/admin/stores" "Admin list stores" "401"
check_route "GET" "/api/v1/admin/stores/pending" "Admin pending stores" "401"
check_route "GET" "/api/v1/admin/suppliers/queue" "Admin supplier queue" "401"

# Supplier Routes
check_route "GET" "/api/v1/supplier/profile" "Supplier profile" "401"
check_route "GET" "/api/v1/supplier/products" "Supplier products" "401"

echo ""
echo "=== CORE-001/002: STATE MACHINE ENDPOINTS ==="
check_route "GET" "/api/v1/admin/stores/pending" "Pending stores queue" "401"
check_route "GET" "/api/v1/admin/suppliers/queue" "Supplier verification queue" "401"

echo ""
echo "=============================================="
echo "GATEWAY ROUTE AUDIT SUMMARY"
echo "=============================================="
echo -e "${GREEN}PASS${NC}: $PASS (routes accessible)"
echo -e "${RED}FAIL${NC}: $FAIL (routes missing from gateway)"
echo -e "${YELLOW}WARN${NC}: $WARN (unexpected status)"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}GATEWAY AUDIT FAILED${NC}"
  echo ""
  echo "Routes returning 404/502/504 indicate the gateway is not proxying them."
  echo "Check api-gateway configuration and nginx routes."
  exit 1
else
  echo -e "${GREEN}GATEWAY AUDIT PASSED${NC}"
  echo "All required routes are accessible through the gateway."
  exit 0
fi
