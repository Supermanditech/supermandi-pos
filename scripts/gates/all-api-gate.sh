#!/bin/bash
# GCP-STG-0724: Unified post-deploy URL gate — all platforms
BASE_URL="${1:-https://staging.supermandi.tech}"
FAIL=0

echo "=== UNIFIED BACKEND URL GATE ==="
echo "Target: $BASE_URL"

check() {
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X "$1" "${BASE_URL}$2" -H "Content-Type: application/json" ${3:+-d "$3"} 2>/dev/null || echo "000")
  if [[ "$STATUS" =~ ^(200|301|302|400|401|403|404|405|429)$ ]]; then
    echo "  ✅ $1 $2 → $STATUS"
  else
    echo "  ❌ $1 $2 → $STATUS"; FAIL=$((FAIL+1))
  fi
}

echo ""
echo "--- Landing ---"
check GET "/"

echo ""
echo "--- Health ---"
check GET "/api/v1/admin/health"

echo ""
echo "--- POS API ---"
check POST "/api/v1/pos/auth/send-otp" '{"phone":"0000000000"}'
check GET "/api/v1/pos/store-products/list"
check GET "/api/v1/public/whatsapp-cta-config"

echo ""
echo "--- Retailer ---"
check GET "/retailer/"
check GET "/api/v1/retailer-admin/products"

echo ""
echo "--- Supplier ---"
check GET "/supplier/"
check POST "/api/v1/supplier/auth/login" '{"email":"test@test.com","password":"x"}'

echo ""
echo "--- SuperAdmin ---"
check GET "/admin/"
check GET "/api/v1/admin/stores"

echo ""
TOTAL=11
PASSED=$((TOTAL - FAIL))
echo "Results: $PASSED/$TOTAL passed, $FAIL failed"

if [ "$FAIL" -gt 2 ]; then
  echo "=== ❌ CRITICAL: >2 failures — AUTO-ROLLBACK RECOMMENDED ==="
  exit 1
elif [ "$FAIL" -gt 0 ]; then
  echo "=== ⚠️ WARNING: $FAIL failure(s) — investigate ==="
  exit 0
fi

echo "=== UNIFIED URL GATE: ✅ ALL PASS ==="
