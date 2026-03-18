#!/usr/bin/env bash
# V3-HARDEN-104: Go-live parity gate for business-critical flows
# Wired into deploy workflow as a blocking pre-deploy step.
set -euo pipefail

echo "=== Production Audit Gate ==="
ERRORS=0

# 1. CSV import storage
if [ -z "${GCS_DOCUMENTS_BUCKET:-}" ]; then
  echo "FAIL: GCS_DOCUMENTS_BUCKET not set (required for CSV import)"
  ERRORS=$((ERRORS+1))
else
  echo "OK: GCS_DOCUMENTS_BUCKET=$GCS_DOCUMENTS_BUCKET"
fi

# 2. Payments — blocking for production
if [ -z "${RAZORPAY_KEY_ID:-}" ] && [ -z "${DEFAULT_UPI_VPA:-}" ]; then
  echo "FAIL: Neither RAZORPAY_KEY_ID nor DEFAULT_UPI_VPA set (UPI payments will fail)"
  ERRORS=$((ERRORS+1))
else
  echo "OK: Payment config present"
fi

# 3. WhatsApp — blocking for production bill sharing
if [ -z "${WHATSAPP_API_TOKEN:-}" ] && [ -z "${WHATSAPP_BUSINESS_PHONE_ID:-}" ]; then
  echo "FAIL: WhatsApp Cloud API not configured (server-backed bill sharing will fail)"
  ERRORS=$((ERRORS+1))
else
  echo "OK: WhatsApp config present"
fi

# 4. Database
if [ -z "${DATABASE_URL:-}" ]; then
  echo "FAIL: DATABASE_URL not set"
  ERRORS=$((ERRORS+1))
else
  echo "OK: DATABASE_URL configured"
fi

# 5. Platform-service stale routes must NOT be mounted
# V3-HARDEN-104: Fixed grep logic — check for uncommented import line
PLATFORM_INDEX="backend/services/platform-service/src/index.ts"
if [ -f "$PLATFORM_INDEX" ]; then
  # Check if retailerPortalRoutes import is uncommented (active)
  if grep -E "^import.*retailerPortalRoutes" "$PLATFORM_INDEX" >/dev/null 2>&1; then
    echo "FAIL: Stale platform-service retailerPortal routes still mounted"
    ERRORS=$((ERRORS+1))
  else
    echo "OK: Platform-service stale routes unmounted"
  fi
else
  echo "OK: Platform-service index not found (expected in monolith deploy)"
fi

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "GATE FAILED: $ERRORS error(s)"
  exit 1
else
  echo "GATE PASSED"
fi
