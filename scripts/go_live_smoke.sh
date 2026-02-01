#!/bin/bash
# QA-001: Go-Live Smoke Test Script
# Run this after completing a batch to verify all services work correctly

set -e

BASE_URL=${1:-"https://supermandi.tech"}

echo "=============================================="
echo "SUPERMANDI GO-LIVE SMOKE TEST"
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

check() {
  local name=$1
  local method=$2
  local url=$3
  local expected=$4

  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE_URL$url" 2>/dev/null || echo "000")

  if [[ "$status" =~ $expected ]]; then
    echo -e "${GREEN}✓${NC} $name ($status)"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $name - expected $expected, got $status"
    ((FAIL++))
  fi
}

echo "=== PORTALS ==="
check "Retailer portal" GET "/retailer/" "200|301|302"
check "Supplier portal" GET "/supplier/" "200|301|302"
check "Admin portal" GET "/admin/" "200|301|302"

echo ""
echo "=== API HEALTH ==="
check "API health" GET "/api/health" "200"

echo ""
echo "=== AUTH ENDPOINTS (400/401 = OK, 404/502 = FAIL) ==="
check "Retailer auth" POST "/api/v1/retailer-admin/auth/firebase-login" "400|401"
check "Supplier auth" POST "/api/v1/supplier/auth/login" "400|401"
check "Admin auth" POST "/api/v1/admin/auth/login" "400|401"

echo ""
echo "=== PROTECTED ROUTES (401 = OK) ==="
check "POS products" GET "/api/v1/pos/products" "401"
check "Admin stores" GET "/api/v1/admin/stores" "401"
check "Supplier portal API" GET "/api/v1/supplier/profile" "401"

echo ""
echo "=== CORE-001/002: State Machine Endpoints ==="
check "Pending stores queue" GET "/api/v1/admin/stores/pending" "401"
check "Supplier queue" GET "/api/v1/admin/suppliers/queue" "401"

echo ""
echo "=============================================="
echo "RESULTS"
echo "=============================================="
echo -e "${GREEN}PASS${NC}: $PASS"
echo -e "${RED}FAIL${NC}: $FAIL"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}SMOKE TEST FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}SMOKE TEST PASSED${NC}"
  exit 0
fi
