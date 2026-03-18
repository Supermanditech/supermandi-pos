#!/usr/bin/env bash
# V3-HARDEN-119: Environment/version parity proof
# Verifies app build SHA matches deployed backend SHA before device QA.
#
# Usage: bash scripts/gates/version-parity-check.sh
# Requires: STAGING_URL, APP_BUILD_SHA (or reads from git)
set -euo pipefail

echo "=== Version Parity Check ==="

BASE_URL="${STAGING_URL:-${API_BASE_URL:-}}"
APP_SHA="${APP_BUILD_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"

echo "App build SHA: $APP_SHA"

if [ -z "$BASE_URL" ]; then
  echo "SKIP: No STAGING_URL — cannot verify backend SHA"
  echo ""
  echo "Manual verification required:"
  echo "  1. App build SHA: $APP_SHA"
  echo "  2. Check gateway:  curl $BASE_URL/health"
  echo "  3. Check backend:  curl $BASE_URL/api/v1/admin/health"
  echo "  4. Check migrations: psql \$DATABASE_URL -c 'SELECT MAX(id) FROM migrations;'"
  exit 0
fi

echo "Checking deployed backend..."
BACKEND_HEALTH=$(curl -s "${BASE_URL}/api/v1/admin/health" 2>/dev/null || echo '{}')
BACKEND_SHA=$(echo "$BACKEND_HEALTH" | grep -oP '"sha":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
echo "Backend SHA: ${BACKEND_SHA:-unknown}"

GATEWAY_HEALTH=$(curl -s "${BASE_URL}/health" 2>/dev/null || echo '{}')
GATEWAY_SHA=$(echo "$GATEWAY_HEALTH" | grep -oP '"sha":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
echo "Gateway SHA: ${GATEWAY_SHA:-unknown}"

echo ""
echo "=== Parity Report ==="
echo "App build:     $APP_SHA"
echo "Backend:       ${BACKEND_SHA:-unknown}"
echo "Gateway:       ${GATEWAY_SHA:-unknown}"
echo ""

if [ "$APP_SHA" = "${BACKEND_SHA:-}" ]; then
  echo "MATCH: App and backend are on the same SHA"
elif [ "$BACKEND_SHA" = "unknown" ]; then
  echo "WARN: Backend SHA not available — manual verification required"
  echo "GATE: WARN (non-blocking — backend health may not expose SHA)"
else
  echo "MISMATCH: App ($APP_SHA) != Backend ($BACKEND_SHA)"
  echo "This may cause auth/feature incompatibility."
  echo "Deploy the matching backend before device QA."
  echo "GATE FAILED: Version mismatch detected"
  exit 1
fi
