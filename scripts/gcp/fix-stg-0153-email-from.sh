#!/usr/bin/env bash
# GCP-STG-0153: Set EMAIL_FROM env var on main-backend Cloud Run service
# Run this from any terminal with gcloud authenticated to supermandi-backend project

set -euo pipefail

PROJECT="supermandi-backend"
REGION="asia-south1"
SERVICE="main-backend"
EMAIL_FROM="supermanditech@gmail.com"

echo "Setting EMAIL_FROM=${EMAIL_FROM} on ${SERVICE}..."
gcloud run services update "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --update-env-vars="EMAIL_FROM=${EMAIL_FROM}"

echo "Verifying..."
gcloud run services describe "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --format="value(spec.template.spec.containers[0].env)" \
  | grep -o "EMAIL_FROM=[^,]*" || echo "WARNING: EMAIL_FROM not found in output"

echo "GCP-STG-0153: Done. Verify by sending a test email from SuperAdmin."
