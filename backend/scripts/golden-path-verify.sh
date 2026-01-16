#!/bin/bash
# =============================================================================
# Golden Path Verification Script - V3.0.10
# Smoke test for VM deploy - validates all critical POS endpoints
#
# Run after deploy: ./scripts/golden-path-verify.sh
# Run with custom URL: API_URL=https://api.supermandi.in ./scripts/golden-path-verify.sh
#
# Tests:
# 1. Scan/Product Lookup (barcode with special chars)
# 2. Products List V2 API
# 3. Reorder Settings/Policies
# 4. Inventory Ledger
# 5. Orders List
# 6. Store Health
# 7. Store Digitisation (SD-ONBOARD-001B)
# =============================================================================

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

API_URL="${API_URL:-http://localhost:3000}"
DEMO_STORE_ID="${DEMO_STORE_ID:-a0000000-0000-0000-0000-000000000001}"
TEST_BARCODE="${TEST_BARCODE:-5004#001000}"
TIMEOUT="${TIMEOUT:-10}"
VERBOSE="${VERBOSE:-false}"

# Test token (demo/dev only - in prod would use real auth)
AUTH_TOKEN="${AUTH_TOKEN:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Results tracking
PASSED=0
FAILED=0
SKIPPED=0
RESULTS=()

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log_info() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $1"
}

log_skip() {
  echo -e "${CYAN}[SKIP]${NC} $1"
}

log_test() {
  echo -e "${BLUE}[TEST]${NC} $1"
}

# URL encode a string (for barcodes with special chars)
urlencode() {
  local string="$1"
  local strlen=${#string}
  local encoded=""
  local pos c o

  for (( pos=0 ; pos<strlen ; pos++ )); do
    c=${string:$pos:1}
    case "$c" in
      [-_.~a-zA-Z0-9] ) o="$c" ;;
      * ) printf -v o '%%%02X' "'$c" ;;
    esac
    encoded+="$o"
  done
  echo "$encoded"
}

# Make HTTP request and capture response
http_request() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"
  local url="${API_URL}${endpoint}"

  local curl_opts=(-s -w "\n%{http_code}" --max-time "$TIMEOUT")

  # Add auth header if provided
  if [[ -n "$AUTH_TOKEN" ]]; then
    curl_opts+=(-H "Authorization: Bearer $AUTH_TOKEN")
  fi

  # Add content-type for POST/PUT
  if [[ "$method" == "POST" || "$method" == "PUT" ]]; then
    curl_opts+=(-H "Content-Type: application/json")
  fi

  # Add store header
  curl_opts+=(-H "x-store-id: $DEMO_STORE_ID")

  local response
  if [[ "$method" == "GET" ]]; then
    response=$(curl "${curl_opts[@]}" -X GET "$url" 2>/dev/null)
  elif [[ "$method" == "POST" ]]; then
    response=$(curl "${curl_opts[@]}" -X POST -d "$data" "$url" 2>/dev/null)
  fi

  echo "$response"
}

# Parse HTTP response (body + status code)
parse_response() {
  local response="$1"
  local http_code="${response##*$'\n'}"
  local body="${response%$'\n'*}"

  echo "$http_code|$body"
}

# Run a test and record result
run_test() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local data="${4:-}"
  local expected_code="${5:-200}"
  local body_check="${6:-}"

  log_test "$name"

  if [[ "$VERBOSE" == "true" ]]; then
    echo "  Request: $method ${API_URL}${endpoint}"
    [[ -n "$data" ]] && echo "  Body: $data"
  fi

  local response
  response=$(http_request "$method" "$endpoint" "$data")

  local parsed
  parsed=$(parse_response "$response")
  local http_code="${parsed%%|*}"
  local body="${parsed#*|}"

  if [[ "$VERBOSE" == "true" ]]; then
    echo "  Response: HTTP $http_code"
    echo "  Body: ${body:0:200}..."
  fi

  # Check status code
  if [[ "$http_code" != "$expected_code" ]]; then
    log_error "$name - Expected HTTP $expected_code, got $http_code"
    [[ -n "$body" ]] && echo "  Response: ${body:0:200}"
    ((FAILED++))
    RESULTS+=("FAIL: $name (HTTP $http_code)")
    return 1
  fi

  # Check body content if specified
  if [[ -n "$body_check" ]]; then
    if ! echo "$body" | grep -q "$body_check"; then
      log_error "$name - Response missing expected content: $body_check"
      ((FAILED++))
      RESULTS+=("FAIL: $name (missing: $body_check)")
      return 1
    fi
  fi

  log_info "$name"
  ((PASSED++))
  RESULTS+=("PASS: $name")
  return 0
}

# =============================================================================
# TEST CASES - GOLDEN PATH
# =============================================================================

test_health() {
  echo ""
  echo "=========================================="
  echo "1. Health Checks"
  echo "=========================================="

  run_test "API Gateway Health" "GET" "/health" "" "200"
  run_test "Enroll Service Health" "GET" "/api/v1/pos/health" "" "200" "enroll"
}

test_scan_lookup() {
  echo ""
  echo "=========================================="
  echo "2. Scan & Product Lookup"
  echo "=========================================="

  # URL encode the barcode (handles # character)
  local encoded_barcode
  encoded_barcode=$(urlencode "$TEST_BARCODE")

  # Test POST /scan/resolve (new format with scanValue)
  run_test "Scan Resolve (POST)" "POST" "/api/v1/pos/scan/resolve" \
    "{\"scanValue\":\"$TEST_BARCODE\",\"storeId\":\"$DEMO_STORE_ID\"}" \
    "200"

  # Test GET /products/lookup (legacy format)
  run_test "Product Lookup (GET)" "GET" "/api/v1/pos/products/lookup?barcode=${encoded_barcode}&storeId=${DEMO_STORE_ID}" \
    "" "200"
}

test_products_v2() {
  echo ""
  echo "=========================================="
  echo "3. Products V2 API"
  echo "=========================================="

  run_test "Products List V2" "GET" "/api/v2/products?storeId=${DEMO_STORE_ID}" \
    "" "200" "products"

  run_test "Products V2 with Category" "GET" "/api/v2/products?storeId=${DEMO_STORE_ID}&category=Grocery" \
    "" "200"
}

test_reorder() {
  echo ""
  echo "=========================================="
  echo "4. Reorder Settings & Policies"
  echo "=========================================="

  run_test "Reorder Settings" "GET" "/api/v1/pos/stores/${DEMO_STORE_ID}/reorder/settings" \
    "" "200"

  run_test "Reorder Policies" "GET" "/api/v1/pos/stores/${DEMO_STORE_ID}/reorder/policies" \
    "" "200"
}

test_inventory() {
  echo ""
  echo "=========================================="
  echo "5. Inventory Ledger"
  echo "=========================================="

  run_test "Inventory Ledger" "GET" "/api/v1/pos/inventory/ledger?storeId=${DEMO_STORE_ID}" \
    "" "200"
}

test_orders() {
  echo ""
  echo "=========================================="
  echo "6. Orders API"
  echo "=========================================="

  # Note: Order list endpoint may vary based on actual route
  run_test "Orders List" "GET" "/api/v1/pos/orders?storeId=${DEMO_STORE_ID}" \
    "" "200"
}

test_digitisation() {
  echo ""
  echo "=========================================="
  echo "7. Store Digitisation (SD-ONBOARD-001B)"
  echo "=========================================="

  # Test scan/resolve with new contract format (barcode only)
  # This should return NEEDS_CREATE or NOT_FOUND for unknown barcode
  run_test "Scan Resolve (Digitisation Contract)" "POST" "/api/v1/pos/scan/resolve" \
    "{\"barcode\":\"TEST_UNKNOWN_99999\"}" \
    "200" "status"

  # Test store-products endpoint exists (should return 422 without required fields)
  run_test "Store Products Endpoint Exists" "POST" "/api/v1/pos/store-products" \
    "{}" \
    "422" "error"
}

# =============================================================================
# SUMMARY
# =============================================================================

print_summary() {
  echo ""
  echo "=========================================="
  echo "GOLDEN PATH VERIFICATION SUMMARY"
  echo "=========================================="
  echo ""

  local total=$((PASSED + FAILED + SKIPPED))

  echo "Results:"
  for result in "${RESULTS[@]}"; do
    if [[ "$result" == PASS* ]]; then
      echo -e "  ${GREEN}$result${NC}"
    elif [[ "$result" == FAIL* ]]; then
      echo -e "  ${RED}$result${NC}"
    else
      echo -e "  ${CYAN}$result${NC}"
    fi
  done

  echo ""
  echo "------------------------------------------"
  echo -e "Passed:  ${GREEN}$PASSED${NC}"
  echo -e "Failed:  ${RED}$FAILED${NC}"
  echo -e "Skipped: ${CYAN}$SKIPPED${NC}"
  echo -e "Total:   $total"
  echo "------------------------------------------"

  if [[ $FAILED -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}ALL GOLDEN PATH TESTS PASSED${NC}"
    echo ""
    return 0
  else
    echo ""
    echo -e "${RED}GOLDEN PATH VERIFICATION FAILED${NC}"
    echo ""
    return 1
  fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
  echo "=========================================="
  echo "SuperMandi Golden Path Verification"
  echo "V3.0.10 GO-LIVE Smoke Test"
  echo "=========================================="
  echo ""
  echo "Configuration:"
  echo "  API_URL:       $API_URL"
  echo "  Store ID:      $DEMO_STORE_ID"
  echo "  Test Barcode:  $TEST_BARCODE"
  echo "  Timeout:       ${TIMEOUT}s"

  # Run all test suites
  test_health
  test_scan_lookup
  test_products_v2
  test_reorder
  test_inventory
  test_orders
  test_digitisation

  # Print summary
  print_summary
}

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

while [[ $# -gt 0 ]]; do
  case $1 in
    -v|--verbose)
      VERBOSE="true"
      shift
      ;;
    -u|--url)
      API_URL="$2"
      shift 2
      ;;
    -s|--store)
      DEMO_STORE_ID="$2"
      shift 2
      ;;
    -b|--barcode)
      TEST_BARCODE="$2"
      shift 2
      ;;
    -t|--timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      echo "SuperMandi Golden Path Verification"
      echo ""
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -v, --verbose        Show detailed request/response"
      echo "  -u, --url URL        API base URL (default: http://localhost:3000)"
      echo "  -s, --store ID       Store ID to test (default: demo store)"
      echo "  -b, --barcode CODE   Test barcode (default: 5004#001000)"
      echo "  -t, --timeout SEC    Request timeout (default: 10)"
      echo "  -h, --help           Show this help"
      echo ""
      echo "Environment Variables:"
      echo "  API_URL              API base URL"
      echo "  DEMO_STORE_ID        Store ID to test"
      echo "  TEST_BARCODE         Barcode to test"
      echo "  AUTH_TOKEN           Bearer token for auth"
      echo ""
      echo "Examples:"
      echo "  $0                                    # Run with defaults"
      echo "  $0 -v                                 # Verbose mode"
      echo "  $0 -u https://api.supermandi.in      # Test production"
      echo "  API_URL=http://vm:3000 $0            # Test VM"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

main
exit $?
