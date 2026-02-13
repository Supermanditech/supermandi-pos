#!/bin/bash
# Go-Live Verification Script
# Run this after deployment to verify critical endpoints

API_URL="${API_URL:-http://localhost:3000}"
DEVICE_TOKEN="${DEVICE_TOKEN:-}"

echo "=== SuperMandi Go-Live Verification ==="
echo "API URL: $API_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() { echo -e "${RED}FAIL${NC}: $1"; }

# 1. Health Check
echo "1. Testing Health Endpoint..."
HEALTH=$(curl -s "$API_URL/api/v1/admin/health")
if echo "$HEALTH" | grep -q "healthy"; then
  pass "Health endpoint"
else
  fail "Health endpoint - $HEALTH"
fi

# 2. Enrollment endpoint exists
echo "2. Testing Enrollment Endpoint..."
ENROLL=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d '{"enrollmentCode": "INVALID"}')
if [ "$ENROLL" = "400" ] || [ "$ENROLL" = "404" ]; then
  pass "Enrollment endpoint responds (got $ENROLL for invalid code)"
else
  fail "Enrollment endpoint - HTTP $ENROLL"
fi

# 3. Token Management endpoints (GL-WF-045-A)
echo "3. Testing Token Management Endpoints..."
if [ -n "$DEVICE_TOKEN" ]; then
  # Token status
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/pos/token/status" \
    -H "x-device-token: $DEVICE_TOKEN")
  if [ "$STATUS" = "200" ]; then
    pass "Token status endpoint"
  else
    fail "Token status - HTTP $STATUS"
  fi

  # Token audit
  AUDIT=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/pos/token/audit" \
    -H "x-device-token: $DEVICE_TOKEN")
  if [ "$AUDIT" = "200" ]; then
    pass "Token audit endpoint"
  else
    fail "Token audit - HTTP $AUDIT"
  fi
else
  echo "   (Skipped - no DEVICE_TOKEN provided)"
fi

# 4. Supplier endpoints
echo "4. Testing Supplier Endpoints..."
SUP_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/v1/supplier/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "password": "wrong"}')
if [ "$SUP_LOGIN" = "401" ] || [ "$SUP_LOGIN" = "400" ]; then
  pass "Supplier login endpoint responds"
else
  fail "Supplier login - HTTP $SUP_LOGIN"
fi

# 5. Retailer Admin endpoints
echo "5. Testing Retailer Admin Endpoints..."
RA_AUTH=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/retailer-admin/auth/me")
if [ "$RA_AUTH" = "401" ]; then
  pass "Retailer admin auth check (401 for no token)"
else
  fail "Retailer admin auth - HTTP $RA_AUTH"
fi

echo ""
echo "=== Verification Complete ==="
echo ""
echo "To test with a real device token:"
echo "  DEVICE_TOKEN=<your-token> API_URL=https://api.supermandi.com ./scripts/verify-go-live.sh"
