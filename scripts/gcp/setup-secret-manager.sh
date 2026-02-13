#!/usr/bin/env bash
# CD-SM-001: Create Secret Manager secrets for SuperMandi
# Usage: ./scripts/gcp/setup-secret-manager.sh [--project PROJECT]
# Idempotent: safe to run multiple times
#
# After running this script, add secret values:
#   echo -n "VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-

set -euo pipefail

PROJECT="${GCP_PROJECT:-supermandi-backend}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# All secrets required by SuperMandi services
SECRETS=(
  "jwt-secret"
  "admin-token"
  "openai-api-key"
  "anthropic-api-key"
  "postgres-password"
  "firebase-sa"
  "firebase-project-id"
)

echo "============================================="
echo "  Secret Manager Setup"
echo "  Project: $PROJECT"
echo "  Secrets: ${#SECRETS[@]}"
echo "============================================="
echo ""

gcloud config set project "$PROJECT" --quiet

# Enable Secret Manager API
echo "--- Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com --quiet
echo "  OK: API enabled"

# Create secrets
echo ""
echo "--- Creating secrets..."
for secret in "${SECRETS[@]}"; do
  if gcloud secrets describe "$secret" --format="value(name)" 2>/dev/null; then
    echo "  OK: $secret (already exists)"
  else
    gcloud secrets create "$secret" \
      --replication-policy="automatic" \
      --quiet
    echo "  CREATED: $secret"
  fi
done

# Get Cloud Run service account
echo ""
echo "--- Granting Cloud Run access to secrets..."
SA_EMAIL="${PROJECT_NUMBER:-}@serverless-robot-prod.iam.gserviceaccount.com"

# Try to get project number
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)" 2>/dev/null || echo "")
if [ -n "$PROJECT_NUMBER" ]; then
  SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

  for secret in "${SECRETS[@]}"; do
    gcloud secrets add-iam-policy-binding "$secret" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet 2>/dev/null || true
  done
  echo "  OK: Granted secretAccessor to $SA_EMAIL"
else
  echo "  WARN: Could not determine project number. Grant access manually:"
  echo "    gcloud secrets add-iam-policy-binding SECRET_NAME \\"
  echo "      --member='serviceAccount:SA_EMAIL' \\"
  echo "      --role='roles/secretmanager.secretAccessor'"
fi

# Show status
echo ""
echo "--- Secret status..."
echo ""
printf "  %-25s %s\n" "SECRET" "HAS_VALUE"
printf "  %-25s %s\n" "-------------------------" "---------"
for secret in "${SECRETS[@]}"; do
  VERSION_COUNT=$(gcloud secrets versions list "$secret" --format="value(name)" 2>/dev/null | wc -l || echo "0")
  if [ "$VERSION_COUNT" -gt 0 ]; then
    printf "  %-25s %s\n" "$secret" "YES ($VERSION_COUNT versions)"
  else
    printf "  %-25s %s\n" "$secret" "NO — add value!"
  fi
done

echo ""
echo "============================================="
echo "  SECRET MANAGER SETUP COMPLETE"
echo "============================================="
echo ""
echo "  Add secret values:"
echo "    echo -n 'my-jwt-secret' | gcloud secrets versions add jwt-secret --data-file=-"
echo "    echo -n 'my-admin-token' | gcloud secrets versions add admin-token --data-file=-"
echo "    echo -n 'sk-...' | gcloud secrets versions add openai-api-key --data-file=-"
echo ""
echo "  For Cloud Run, secrets are mounted as env vars:"
echo "    --set-secrets=JWT_SECRET=jwt-secret:latest,ADMIN_TOKEN=admin-token:latest,..."
echo ""
