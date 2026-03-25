#!/bin/bash
# GCP-STG-0719: CD env var verification — compare deploy.yml config against Cloud Run
echo "=== CD ENV VAR VERIFICATION ==="

if ! command -v gcloud &>/dev/null; then
  echo "WARNING gcloud CLI not available — manual check required"
  echo ""
  echo "Expected env vars on Cloud Run (from deploy.yml):"
  echo "  NODE_ENV, GIT_SHA, MIN_APP_VERSION"
  echo "  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_SSL"
  echo "  REDIS_HOST, REDIS_PORT, REDIS_URL"
  echo "  FIREBASE_ENABLED, FIREBASE_PROJECT_ID"
  echo "  SMS_DISABLED, RATE_LIMIT_MULTIPLIER"
  echo "  EMAIL_PROVIDER, SMTP_HOST, SMTP_PORT, SMTP_USER, EMAIL_FROM"
  echo "  ADMIN_EMAIL_ALLOWLIST, LOG_LEVEL, LOG_FORMAT"
  echo "  CORS_ALLOWED_ORIGINS, ALLOWED_ORIGINS"
  echo "  GCS_DOCUMENTS_BUCKET, GCS_IMAGES_BUCKET"
  echo "  PORTAL_BASE_URL, FRONTEND_URL"
  echo "  SUPPLIER_PORTAL_URL, RETAILER_ADMIN_URL"
  echo "  SUPERMANDI_ENTITY_NAME, SUPERMANDI_GSTIN, SUPERMANDI_ADDRESS, SUPERMANDI_STATE"
  echo "  FEATURE_REORDER_ENABLED"
  echo ""
  echo "Expected secrets (from --set-secrets):"
  echo "  DATABASE_URL, DB_PASSWORD, JWT_SECRET, JWT_SECRET_PREVIOUS"
  echo "  SERVICE_TOKEN_SECRET, ADMIN_TOKEN, SMTP_PASS"
  echo "  WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID"
  echo "  WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET"
  echo "  OPENAI_API_KEY, RAZORPAY_WEBHOOK_SECRET, INVOICE_SIGNING_KEY"
  echo ""
  echo "To verify after deploy:"
  echo "  gcloud run services describe main-backend --region=asia-south1 \\"
  echo "    --format='json(spec.template.spec.containers[0].env[].name)'"
  exit 0
fi

echo "Fetching Cloud Run env vars..."
DEPLOYED_VARS=$(gcloud run services describe main-backend --region=asia-south1 \
  --format='value(spec.template.spec.containers[0].env[].name)' 2>/dev/null | sort)

REQUIRED_VARS="NODE_ENV DB_HOST DB_PORT DB_NAME REDIS_HOST REDIS_URL FIREBASE_ENABLED ADMIN_EMAIL_ALLOWLIST CORS_ALLOWED_ORIGINS LOG_LEVEL"
FAIL=0

for var in $REQUIRED_VARS; do
  if echo "$DEPLOYED_VARS" | grep -q "^${var}$"; then
    echo "OK $var"
  else
    echo "MISSING: $var"
    FAIL=1
  fi
done

[ "$FAIL" -eq 0 ] && echo "=== CD ENV VERIFY: PASS ===" || { echo "=== FAIL — missing env vars ==="; exit 1; }
