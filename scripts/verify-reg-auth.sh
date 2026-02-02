#!/bin/bash
# =============================================================================
# REG-AUTH-501: Registration-First Authentication Verification Script
#
# This script validates all REG-AUTH implementations are deployed and working:
#   - Registration endpoints (REG-AUTH-201, REG-AUTH-202)
#   - OTP guardrail (REG-AUTH-203)
#   - LIMITED MODE behavior (REG-AUTH-204, REG-AUTH-401)
#   - Document upload (REG-AUTH-102)
#
# Usage:
#   ./scripts/verify-reg-auth.sh                    # Test localhost
#   ./scripts/verify-reg-auth.sh http://34.14.220.171:3000  # Test VM
#
# Exit codes:
#   0 = All tests passed
#   1 = One or more tests failed
# =============================================================================

set -e

# Configuration
BASE_URL="${1:-http://localhost:3000}"
DEMO_TOKEN="${DEVICE_TOKEN:-demo-smoke-test-token-001}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
  local curl_cmd="curl -s -w '%{http_code}' -o /tmp/reg_auth_response.txt -X $method"
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
    echo "       Response: $(cat /tmp/reg_auth_response.txt 2>/dev/null | head -c 300)"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# Helper to check response body contains a string
test_response_contains() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local expected_string="$4"
  local headers="$5"
  local data="$6"

  TOTAL=$((TOTAL + 1))

  # Build curl command
  local curl_cmd="curl -s -X $method '$BASE_URL$endpoint'"

  if [ -n "$headers" ]; then
    curl_cmd="$curl_cmd $headers"
  fi

  if [ -n "$data" ]; then
    curl_cmd="$curl_cmd -d '$data'"
  fi

  # Execute
  local response=$(eval $curl_cmd 2>/dev/null)

  # Check result
  if echo "$response" | grep -q "$expected_string"; then
    echo -e "${GREEN}PASS${NC} [contains '$expected_string'] $name"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}FAIL${NC} [missing '$expected_string'] $name"
    echo "       Response: $(echo "$response" | head -c 300)"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

echo "=============================================="
echo " REG-AUTH-501: Registration-First Auth Verify"
echo "=============================================="
echo "Target: $BASE_URL"
echo "Demo Token: $DEMO_TOKEN"
echo "=============================================="
echo ""

# =============================================================================
# 1. HEALTH CHECK
# =============================================================================
echo -e "${BLUE}--- 1. Health Endpoints ---${NC}"

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

echo ""

# =============================================================================
# 2. RETAILER REGISTRATION (REG-AUTH-201)
# =============================================================================
echo -e "${BLUE}--- 2. Retailer Registration API (REG-AUTH-201) ---${NC}"

# Test registration endpoint exists (expects 400 for missing body)
test_endpoint \
  "Retailer registration endpoint exists" \
  "POST" \
  "/api/v1/retailer-admin/registration/create" \
  "400" \
  "-H 'Content-Type: application/json'" \
  '{}'

# Test registration with missing fields
test_response_contains \
  "Retailer registration validation (missing fields)" \
  "POST" \
  "/api/v1/retailer-admin/registration/create" \
  "required" \
  "-H 'Content-Type: application/json'" \
  '{"phone":""}'

# Test application lookup (uses /lookup endpoint, not /status)
test_endpoint \
  "Retailer application lookup endpoint" \
  "GET" \
  "/api/v1/retailer-admin/registration/lookup?phone=%2B919999999999" \
  "200" \
  "-H 'Content-Type: application/json'"

echo ""

# =============================================================================
# 3. SUPPLIER REGISTRATION (REG-AUTH-202)
# =============================================================================
echo -e "${BLUE}--- 3. Supplier Registration API (REG-AUTH-202) ---${NC}"

# Test registration endpoint exists
test_endpoint \
  "Supplier registration endpoint exists" \
  "POST" \
  "/api/v1/supplier/registration/create" \
  "400" \
  "-H 'Content-Type: application/json'" \
  '{}'

# Test registration with missing fields
test_response_contains \
  "Supplier registration validation (missing fields)" \
  "POST" \
  "/api/v1/supplier/registration/create" \
  "required" \
  "-H 'Content-Type: application/json'" \
  '{"phone":"","email":""}'

echo ""

# =============================================================================
# 4. OTP GUARDRAIL (REG-AUTH-203)
# =============================================================================
echo -e "${BLUE}--- 4. OTP Guardrail (REG-AUTH-203) ---${NC}"

# Test OTP verify without application_id returns 403 (REGISTRATION_REQUIRED)
test_endpoint \
  "Retailer OTP verify without application_id (blocked)" \
  "POST" \
  "/api/v1/retailer-admin/registration/verify-otp" \
  "403" \
  "-H 'Content-Type: application/json'" \
  '{"idToken":"fake-token"}'

test_endpoint \
  "Supplier OTP verify without application_id (blocked)" \
  "POST" \
  "/api/v1/supplier/registration/verify-otp" \
  "403" \
  "-H 'Content-Type: application/json'" \
  '{"idToken":"fake-token"}'

echo ""

# =============================================================================
# 5. LIMITED MODE (REG-AUTH-204, REG-AUTH-401)
# =============================================================================
echo -e "${BLUE}--- 5. LIMITED MODE (REG-AUTH-204, REG-AUTH-401) ---${NC}"

# Test ui-status returns storeStatus field
test_response_contains \
  "POS ui-status includes storeStatus field" \
  "GET" \
  "/api/v1/pos/ui-status" \
  "storeStatus" \
  "-H 'X-Device-Token: $DEMO_TOKEN' -H 'Content-Type: application/json'"

# Test ui-status returns storeActive field
test_response_contains \
  "POS ui-status includes storeActive field" \
  "GET" \
  "/api/v1/pos/ui-status" \
  "storeActive" \
  "-H 'X-Device-Token: $DEMO_TOKEN' -H 'Content-Type: application/json'"

echo ""

# =============================================================================
# 6. DOCUMENT UPLOAD (REG-AUTH-102)
# =============================================================================
echo -e "${BLUE}--- 6. Document Upload (REG-AUTH-102) ---${NC}"

# Test document upload endpoint validation (missing required fields)
test_response_contains \
  "Document upload endpoint validates required fields" \
  "POST" \
  "/api/v1/documents/upload" \
  "entity_type, entity_id, and document_type are required" \
  "-F 'file=@/dev/null'"

# Test end-to-end document upload with real application
echo -e "${YELLOW}Testing end-to-end document upload...${NC}"

# Create a test application
TEST_GSTIN="27AADCT$(date +%s | tail -c 5)Z1ZP"
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/retailer-admin/registration/create" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"+919876500001\",\"businessName\":\"Doc Upload Test\",\"ownerName\":\"Test\",\"gstin\":\"$TEST_GSTIN\"}")

APP_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$APP_ID" ] && [ "$APP_ID" != "null" ]; then
  echo -e "${GREEN}PASS${NC} [created app $APP_ID] Test application created for document upload"
  PASSED=$((PASSED + 1))
  TOTAL=$((TOTAL + 1))

  # Create a minimal PNG file for upload
  TEMP_PNG="/tmp/test_upload_$$.png"
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "$TEMP_PNG" 2>/dev/null

  # Upload document
  UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/documents/upload" \
    -F "file=@$TEMP_PNG;type=image/png" \
    -F "entity_type=application" \
    -F "entity_id=$APP_ID" \
    -F "document_type=pan")

  rm -f "$TEMP_PNG" 2>/dev/null

  TOTAL=$((TOTAL + 1))
  if echo "$UPLOAD_RESPONSE" | grep -q '"document_id"'; then
    DOC_ID=$(echo "$UPLOAD_RESPONSE" | grep -o '"document_id":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}PASS${NC} [doc_id: $DOC_ID] Document uploaded successfully"
    echo "       file_url: /api/v1/documents/$DOC_ID"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}FAIL${NC} [upload failed] Document upload did not return document_id"
    echo "       Response: $(echo "$UPLOAD_RESPONSE" | head -c 300)"
    FAILED=$((FAILED + 1))
  fi
else
  echo -e "${RED}FAIL${NC} [no app created] Could not create test application for document upload"
  echo "       Response: $(echo "$CREATE_RESPONSE" | head -c 300)"
  FAILED=$((FAILED + 1))
  TOTAL=$((TOTAL + 1))
fi

echo ""

# =============================================================================
# 7. EXISTING AUTH STILL WORKS
# =============================================================================
echo -e "${BLUE}--- 7. Existing Auth Verification ---${NC}"

# Retailer admin password login
test_endpoint \
  "Retailer admin login endpoint exists" \
  "POST" \
  "/api/v1/retailer-admin/auth/login" \
  "401" \
  "-H 'Content-Type: application/json'" \
  '{"email":"","password":""}'

# Supplier login
test_endpoint \
  "Supplier auth login endpoint exists" \
  "POST" \
  "/api/v1/supplier/auth/login" \
  "400" \
  "-H 'Content-Type: application/json'" \
  '{"email":"","password":""}'

# POS device token auth
test_endpoint \
  "POS device token auth works" \
  "GET" \
  "/api/v1/pos/ui-status" \
  "200" \
  "-H 'X-Device-Token: $DEMO_TOKEN' -H 'Content-Type: application/json'"

test_endpoint \
  "POS invalid token rejected" \
  "GET" \
  "/api/v1/pos/ui-status" \
  "401" \
  "-H 'X-Device-Token: invalid-token' -H 'Content-Type: application/json'"

echo ""

# =============================================================================
# 8. ADMIN EMAIL OTP (GO-LIVE-ADMIN-EMAIL-001)
# =============================================================================
echo -e "${BLUE}--- 8. Admin Email OTP (GO-LIVE-ADMIN-EMAIL-001) ---${NC}"

# Test admin email OTP send endpoint exists
test_endpoint \
  "Admin email OTP send endpoint exists" \
  "POST" \
  "/api/v1/admin/auth/send-email-otp" \
  "400" \
  "-H 'Content-Type: application/json'" \
  '{}'

# Test with invalid/unauthorized email (should return 403)
test_endpoint \
  "Admin email OTP rejects unauthorized email" \
  "POST" \
  "/api/v1/admin/auth/send-email-otp" \
  "403" \
  "-H 'Content-Type: application/json'" \
  '{"email":"unauthorized@example.com"}'

# Test admin email OTP verify endpoint exists
test_endpoint \
  "Admin email OTP verify endpoint exists" \
  "POST" \
  "/api/v1/admin/auth/verify-email-otp" \
  "400" \
  "-H 'Content-Type: application/json'" \
  '{}'

# Test admin auth check endpoint
test_endpoint \
  "Admin auth check endpoint exists" \
  "GET" \
  "/api/v1/admin/auth/check" \
  "401" \
  "-H 'Content-Type: application/json'"

echo ""

# =============================================================================
# 9. RETAILER/SUPPLIER LOOKUP APIs (GO-LIVE-UI-REG-004)
# =============================================================================
echo -e "${BLUE}--- 9. Registration Lookup APIs (GO-LIVE-UI-REG-004) ---${NC}"

# Test retailer lookup endpoint
test_endpoint \
  "Retailer registration lookup endpoint exists" \
  "GET" \
  "/api/v1/retailer-admin/registration/lookup?phone=%2B919999999999" \
  "200" \
  "-H 'Content-Type: application/json'"

# Test supplier lookup endpoint
test_endpoint \
  "Supplier registration lookup endpoint exists" \
  "GET" \
  "/api/v1/supplier/registration/lookup?phone=%2B919999999999" \
  "200" \
  "-H 'Content-Type: application/json'"

echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "=============================================="
echo " REG-AUTH-501 VERIFICATION SUMMARY"
echo "=============================================="
echo -e "Total:  $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "=============================================="

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}ALL REG-AUTH TESTS PASSED${NC}"
  echo ""
  echo "Registration-First Authentication is deployed and working!"
  echo ""
  echo "Verified:"
  echo "  [x] REG-AUTH-201: Retailer Registration API"
  echo "  [x] REG-AUTH-202: Supplier Registration API"
  echo "  [x] REG-AUTH-203: OTP Guardrail (no login without application)"
  echo "  [x] REG-AUTH-204: LIMITED MODE endpoints"
  echo "  [x] REG-AUTH-401: POS App ui-status integration"
  echo "  [x] REG-AUTH-102: Document upload endpoint"
  echo "  [x] GO-LIVE-ADMIN-EMAIL-001: Admin Email OTP endpoints"
  echo "  [x] GO-LIVE-UI-REG-004: Registration Lookup APIs"
  exit 0
else
  echo -e "${RED}SOME REG-AUTH TESTS FAILED${NC}"
  echo ""
  echo "Review the failures above and ensure all REG-AUTH tickets are deployed."
  exit 1
fi
