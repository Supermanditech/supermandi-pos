#!/usr/bin/env bash
# Set missing env vars on staging Cloud Run services
# Run AFTER creating the secrets in Secret Manager
#
# Usage:
#   1. Create secrets first:
#      echo -n "sk-..." | gcloud secrets create OPENAI_API_KEY --data-file=- --project=supermandi-backend
#      (repeat for each secret)
#   2. Then run this script to wire them into the Cloud Run service

set -euo pipefail

PROJECT="supermandi-backend"
REGION="asia-south1"
SERVICE="main-backend"

echo "=== Setting missing env vars on ${SERVICE} ==="

# Plain env vars (not secrets)
gcloud run services update "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --update-env-vars="MAX_COMMISSION_PERCENT=30"

echo "✅ MAX_COMMISSION_PERCENT=30 set"

# Secret-backed env vars
# These require the secrets to exist in Secret Manager first.
# Create them with:
#   echo -n "VALUE" | gcloud secrets create SECRET_NAME --data-file=- --project=supermandi-backend
#
# Required secrets:
#   - OPENAI_API_KEY
#   - RAZORPAY_KEY_ID
#   - RAZORPAY_KEY_SECRET
#   - INVOICE_SIGNING_KEY

gcloud run services update "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --update-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest,RAZORPAY_KEY_ID=RAZORPAY_KEY_ID:latest,RAZORPAY_KEY_SECRET=RAZORPAY_KEY_SECRET:latest,INVOICE_SIGNING_KEY=INVOICE_SIGNING_KEY:latest"

echo "✅ Secret-backed env vars wired"

echo ""
echo "=== Verify ==="
gcloud run services describe "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --format="json(spec.template.spec.containers[0].env)" \
  | grep -E "OPENAI|RAZORPAY|INVOICE|MAX_COMMISSION"

echo ""
echo "Done. New revision will be created automatically."
