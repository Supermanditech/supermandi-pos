#!/usr/bin/env bash
# LOCAL-PROD-201: Pre-live verification against local Docker stack
# Usage: ./scripts/prelive-verify.sh --base-url http://localhost:8080 --sha <sha>
#
# Runs smoke tests and captures evidence for RELEASES/EVIDENCE/local/<sha>/

set -euo pipefail

BASE_URL=""
SHA=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --sha) SHA="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$BASE_URL" ] || [ -z "$SHA" ]; then
  echo "Usage: ./scripts/prelive-verify.sh --base-url http://localhost:8080 --sha <sha>"
  exit 1
fi

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
EVIDENCE_DIR="$REPO_ROOT/RELEASES/EVIDENCE/local/$SHA"
REGISTRY="${REGISTRY:-supermandi}"
PASSED=0
FAILED=0
FAILURES=""

mkdir -p "$EVIDENCE_DIR"

echo "============================================="
echo "  Pre-Live Verification — SHA: $SHA"
echo "  Base URL: $BASE_URL"
echo "  Evidence: $EVIDENCE_DIR"
echo "============================================="
echo ""

check() {
  local name=$1
  local url=$2
  local expected_status=${3:-200}

  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

  if [ "$status" = "$expected_status" ]; then
    echo "  PASS: $name ($url) → $status"
    PASSED=$((PASSED + 1))
  else
    echo "  FAIL: $name ($url) → $status (expected $expected_status)"
    FAILED=$((FAILED + 1))
    FAILURES="${FAILURES}\n  - $name: got $status, expected $expected_status"
  fi
}

check_json() {
  local name=$1
  local url=$2
  local expected_field=$3

  local body
  body=$(curl -sf "$url" 2>/dev/null || echo "")

  if echo "$body" | grep -q "$expected_field"; then
    echo "  PASS: $name — found '$expected_field'"
    PASSED=$((PASSED + 1))
  else
    echo "  FAIL: $name — '$expected_field' not found in response"
    echo "         Response: $body"
    FAILED=$((FAILED + 1))
    FAILURES="${FAILURES}\n  - $name: missing '$expected_field'"
  fi
}

# =============================================================================
# 1. API Health + Version
# =============================================================================
echo "--- API Endpoints ---"
check "API Health"  "$BASE_URL/health"
check_json "API Version" "$BASE_URL/version" "$SHA"

# =============================================================================
# 2. Portal Endpoints
# =============================================================================
echo ""
echo "--- Portal Endpoints ---"
check "Retailer Admin" "http://localhost:8081/" 200
check "Supplier Portal" "http://localhost:8082/" 200
check "SuperAdmin" "http://localhost:8083/" 200
check "Landing Page" "http://localhost:8084/" 200

# =============================================================================
# 3. Capture Docker Image Digests
# =============================================================================
echo ""
echo "--- Image Digests ---"
DIGEST_FILE="$EVIDENCE_DIR/image-digests.txt"
> "$DIGEST_FILE"
for svc in api-gateway auth-service catalog-service inventory-service order-service \
           payment-service platform-service reorder-service supplier-service voice-service \
           retailer-admin supplier-portal superadmin landing; do
  local_id=$(docker image inspect "${REGISTRY}/${svc}:${SHA}" --format='{{.ID}}' 2>/dev/null || echo "NOT_FOUND")
  echo "  ${svc}: ${local_id}" | tee -a "$DIGEST_FILE"
done

# =============================================================================
# 4. Save Evidence
# =============================================================================
echo ""
echo "--- Saving Evidence ---"

# Health response
curl -sf "$BASE_URL/health" > "$EVIDENCE_DIR/health-response.json" 2>/dev/null || true

# Version response
curl -sf "$BASE_URL/version" > "$EVIDENCE_DIR/version-response.json" 2>/dev/null || true

# Docker images listing
docker images --format "{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}" | \
  grep "${REGISTRY}/" | grep ":${SHA}" | sort > "$EVIDENCE_DIR/docker-images.txt" 2>/dev/null || true

echo "  Saved to: $EVIDENCE_DIR/"
ls -la "$EVIDENCE_DIR/"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "============================================="
echo "  PRELIVE VERIFICATION — SHA: $SHA"
echo "============================================="
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
if [ $FAILED -gt 0 ]; then
  echo -e "  Failures: $FAILURES"
  echo ""
  echo "  VERIFICATION FAILED"
  exit 1
else
  echo ""
  echo "  ALL CHECKS PASSED"
fi
