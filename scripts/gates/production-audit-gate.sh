#!/usr/bin/env bash
# V3-HARDEN-104: Go-live parity gate for business-critical flows
# Wired into deploy workflow as a blocking pre-deploy step.
#
# SCOPE (narrowed from ticket):
# This gate verifies CONFIGURATION PRESENCE for business-critical flows.
# It does NOT verify runtime behavior of payment init/confirm or WhatsApp
# send/webhook — those require a running backend + DB and are covered by:
#   - staging smoke tests (operator-run after deploy)
#   - backend contract tests (CI, pre-merge)
#   - Maestro e2e harness (device-level)
#
# DEPLOY_TIER=staging: Payment + WhatsApp secrets are WARNINGS (not errors).
#   These services degrade gracefully when unconfigured.
# DEPLOY_TIER=production: All secrets are ERRORS (must be set).
#
# What this gate DOES block on (all tiers):
#   1. Storage config for CSV import (GCS_DOCUMENTS_BUCKET)
#   2. Database connectivity (DATABASE_URL)
#   3. Stale platform-service routes not mounted
#
# What this gate WARNS on (staging only):
#   3. Payment gateway config (RAZORPAY_KEY_ID or DEFAULT_UPI_VPA)
#   4. WhatsApp Cloud API config (WHATSAPP_API_TOKEN + PHONE_ID)
set -euo pipefail

TIER="${DEPLOY_TIER:-staging}"
echo "=== Production Audit Gate (tier: $TIER) ==="
ERRORS=0
WARNINGS=0

# 1. CSV import storage — required for all tiers
if [ -z "${GCS_DOCUMENTS_BUCKET:-}" ]; then
  echo "FAIL: GCS_DOCUMENTS_BUCKET not set (required for CSV import)"
  ERRORS=$((ERRORS+1))
else
  echo "OK: GCS_DOCUMENTS_BUCKET=$GCS_DOCUMENTS_BUCKET"
fi

# 2. Database — required for all tiers
if [ -z "${DATABASE_URL:-}" ]; then
  echo "FAIL: DATABASE_URL not set"
  ERRORS=$((ERRORS+1))
else
  echo "OK: DATABASE_URL configured"
fi

# 3. Payments — required for production, warning for staging
# (Razorpay/PhonePe/PineLabs degrade gracefully: core POS works without them)
if [ -z "${RAZORPAY_KEY_ID:-}" ] && [ -z "${DEFAULT_UPI_VPA:-}" ]; then
  if [ "$TIER" = "production" ]; then
    echo "FAIL: Neither RAZORPAY_KEY_ID nor DEFAULT_UPI_VPA set (UPI payments will fail)"
    ERRORS=$((ERRORS+1))
  else
    echo "WARN: Payment gateway not configured — UPI disabled, core POS works (add keys after staging test)"
    WARNINGS=$((WARNINGS+1))
  fi
else
  echo "OK: Payment config present"
fi

# 4. WhatsApp — required for production, warning for staging
# (WhatsApp degrades gracefully: sendBillReceipt returns { sent: false })
if [ -z "${WHATSAPP_API_TOKEN:-}" ] && [ -z "${WHATSAPP_BUSINESS_PHONE_ID:-}" ]; then
  if [ "$TIER" = "production" ]; then
    echo "FAIL: WhatsApp Cloud API not configured (server-backed bill sharing will fail)"
    ERRORS=$((ERRORS+1))
  else
    echo "WARN: WhatsApp not configured — bill sharing disabled (add keys after staging test)"
    WARNINGS=$((WARNINGS+1))
  fi
else
  echo "OK: WhatsApp config present"
fi

# 5. Platform-service stale routes
PLATFORM_INDEX="backend/services/platform-service/src/index.ts"
if [ -f "$PLATFORM_INDEX" ]; then
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
  echo "GATE FAILED: $ERRORS error(s), $WARNINGS warning(s)"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo "GATE PASSED with $WARNINGS warning(s) (staging tier — non-blocking)"
else
  echo "GATE PASSED"
fi
