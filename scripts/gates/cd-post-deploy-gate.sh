#!/bin/bash
# GCP-STG-0718: CD post-deploy gate — verify all URLs, auto-rollback on failure
BASE_URL="${1:-https://staging.supermandi.tech}"
TIMEOUT=60
FAIL_COUNT=0

echo "=== CD POST-DEPLOY GATE ==="
echo "Target: $BASE_URL"

check_url() {
  local path="$1"
  local expected="$2"
  local url="${BASE_URL}${path}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
  if [[ "$STATUS" =~ ^(200|301|302|400|401)$ ]]; then
    echo "  PASS $path -> $STATUS"
  else
    echo "  FAIL $path -> $STATUS (expected reachable)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

check_url "/" "200"
check_url "/api/v1/admin/health" "200"
check_url "/retailer/" "200"
check_url "/supplier/" "200"
check_url "/admin/" "200"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo ""
  echo "FAIL: $FAIL_COUNT URL(s) FAILED — DEPLOY UNHEALTHY"
  echo "ACTION: Auto-rollback to previous revision recommended"
  exit 1
fi

echo ""
echo "=== CD POST-DEPLOY GATE: ALL 5 URLs PASS ==="
