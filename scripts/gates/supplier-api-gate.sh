#!/bin/bash
# GCP-STG-0722: Supplier backend URL gate
BASE_URL="${1:-https://staging.supermandi.tech/api/v1}"
FAIL=0

echo "=== SUPPLIER BACKEND URL GATE ==="
check() {
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X "$1" "$BASE_URL$2" -H "Content-Type: application/json" ${3:+-d "$3"} 2>/dev/null || echo "000")
  if [[ "$STATUS" =~ ^(200|400|401|403|404|405|429)$ ]]; then
    echo "  PASS $1 $2 -> $STATUS"
  else
    echo "  FAIL $1 $2 -> $STATUS"; FAIL=$((FAIL+1))
  fi
}

check POST "/supplier/auth/login" '{"email":"test@test.com","password":"test"}'
check GET "/supplier/products"
check GET "/admin/health"

[ "$FAIL" -eq 0 ] && echo "=== SUPPLIER API GATE: PASS ===" || { echo "=== SUPPLIER API GATE: $FAIL FAILED ==="; exit 1; }
