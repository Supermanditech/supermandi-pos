#!/bin/bash
# OPS-001: Deployment Proof Script
# Run this after every deployment to verify services are correctly deployed

set -e

BASE_URL=${1:-"https://supermandi.tech"}
VERBOSE=${2:-"false"}

echo "=============================================="
echo "SUPERMANDI DEPLOYMENT PROOF"
echo "=============================================="
echo "Target: $BASE_URL"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASS=0
FAIL=0
WARN=0

# Helper function for checks
check() {
  local name=$1
  local method=$2
  local url=$3
  local expected=$4

  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE_URL$url" 2>/dev/null || echo "000")

  if [[ "$status" =~ $expected ]]; then
    echo -e "${GREEN}✓ PASS${NC}: $name ($status)"
    ((PASS++))
  else
    echo -e "${RED}✗ FAIL${NC}: $name - expected $expected, got $status"
    ((FAIL++))
  fi
}

# Get JSON value from response
get_health() {
  local url=$1
  local output

  output=$(curl -s "$BASE_URL$url" 2>/dev/null || echo '{"status":"error"}')
  echo "$output"
}

echo "=== 1. PORTAL ACCESSIBILITY ==="
check "Retailer portal" GET "/retailer/" "200|301|302"
check "Supplier portal" GET "/supplier/" "200|301|302"
check "Admin portal" GET "/admin/" "200|301|302"
echo ""

echo "=== 2. API HEALTH ENDPOINTS ==="
check "API health" GET "/api/health" "200"
check "Admin health" GET "/api/v1/admin/health" "200"
check "Platform health" GET "/api/v1/platform/health" "200"
check "Auth health" GET "/api/v1/auth/health" "200"
check "Inventory health" GET "/api/v1/inventory/health" "200"
check "Orders health" GET "/api/v1/orders/health" "200"
check "Catalog health" GET "/api/v1/catalog/health" "200"
check "Suppliers health" GET "/api/v1/suppliers/health" "200"
echo ""

echo "=== 3. AUTH ENDPOINTS (should return 400/401, not 404) ==="
check "Retailer Firebase login" POST "/api/v1/retailer-admin/auth/firebase-login" "400|401"
check "Supplier login" POST "/api/v1/supplier/auth/login" "400|401"
check "Supplier register" POST "/api/v1/supplier/auth/register" "400|401"
check "Admin login" POST "/api/v1/admin/auth/login" "400|401"
echo ""

echo "=== 4. PROTECTED ENDPOINTS (should return 401, not 404) ==="
check "POS products (unauth)" GET "/api/v1/pos/products" "401"
check "POS sales (unauth)" POST "/api/v1/pos/sales" "401"
check "Admin stores (unauth)" GET "/api/v1/admin/stores" "401"
echo ""

echo "=== 5. VERSION INFO (from health endpoints) ==="
health_output=$(get_health "/api/v1/platform/health")
if [ "$VERBOSE" = "true" ]; then
  echo "Platform health response:"
  echo "$health_output" | jq . 2>/dev/null || echo "$health_output"
fi

# Extract version info
git_sha=$(echo "$health_output" | jq -r '.gitSha // "unknown"' 2>/dev/null || echo "unknown")
version=$(echo "$health_output" | jq -r '.version // "unknown"' 2>/dev/null || echo "unknown")
db_status=$(echo "$health_output" | jq -r '.database // "unknown"' 2>/dev/null || echo "unknown")

echo "Git SHA: $git_sha"
echo "Version: $version"
echo "Database: $db_status"
echo ""

echo "=== 6. DOCKER STATUS (run on VM) ==="
echo "If on VM, run: docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"
echo ""

echo "=============================================="
echo "=== DEPLOYMENT PROOF SUMMARY ==="
echo "=============================================="
echo -e "${GREEN}PASS${NC}: $PASS"
echo -e "${RED}FAIL${NC}: $FAIL"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}DEPLOYMENT VERIFICATION FAILED${NC}"
  echo "Please check the failed endpoints above."
  exit 1
else
  echo -e "${GREEN}DEPLOYMENT VERIFICATION PASSED${NC}"
  exit 0
fi
