#!/usr/bin/env bash
# GCP-STG-0002: Set RATE_LIMIT_MULTIPLIER=10 on staging to prevent OTP rate-limit lockouts
# Production should NOT set this (defaults to 1x = 2/min, 5/hour)

set -euo pipefail

PROJECT="supermandi-backend"
REGION="asia-south1"
SERVICE="main-backend"

echo "Setting RATE_LIMIT_MULTIPLIER=10 on ${SERVICE}..."
gcloud run services update "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --update-env-vars="RATE_LIMIT_MULTIPLIER=10"

echo "GCP-STG-0002: Done. Staging now allows 20/min, 50/hour OTP sends."
