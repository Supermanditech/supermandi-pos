#!/usr/bin/env bash
# CD-WIF-001: Setup Workload Identity Federation for GitHub Actions → GCP
# Usage: ./scripts/gcp/setup-wif.sh [--project PROJECT] [--github-org ORG] [--github-repo REPO]
# Idempotent: safe to run multiple times
#
# After running, set GitHub secrets:
#   GCP_WIF_PROVIDER: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
#   GCP_SA_EMAIL: github-actions@PROJECT.iam.gserviceaccount.com

set -euo pipefail

PROJECT="${GCP_PROJECT:-supermandi-backend}"
GITHUB_ORG="${GITHUB_ORG:-}"
GITHUB_REPO="${GITHUB_REPO:-supermandi-pos}"
POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"
SA_NAME="github-actions"

while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT="$2"; shift 2 ;;
    --github-org) GITHUB_ORG="$2"; shift 2 ;;
    --github-repo) GITHUB_REPO="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$GITHUB_ORG" ]; then
  echo "ERROR: --github-org is required (your GitHub org or username)"
  echo "Usage: ./scripts/gcp/setup-wif.sh --github-org YOUR_ORG"
  exit 1
fi

echo "============================================="
echo "  Workload Identity Federation Setup"
echo "  Project:    $PROJECT"
echo "  GitHub:     $GITHUB_ORG/$GITHUB_REPO"
echo "  Pool:       $POOL_NAME"
echo "  Provider:   $PROVIDER_NAME"
echo "  SA:         $SA_NAME"
echo "============================================="
echo ""

gcloud config set project "$PROJECT" --quiet

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")
echo "  Project number: $PROJECT_NUMBER"

# Enable required APIs
echo ""
echo "--- Enabling APIs..."
gcloud services enable iam.googleapis.com --quiet
gcloud services enable iamcredentials.googleapis.com --quiet
gcloud services enable cloudresourcemanager.googleapis.com --quiet
echo "  OK: APIs enabled"

# Create service account
echo ""
echo "--- Creating service account: $SA_NAME..."
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SA_EMAIL" 2>/dev/null; then
  echo "  OK: Service account already exists"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions CI/CD" \
    --quiet
  echo "  OK: Service account created: $SA_EMAIL"
fi

# Grant required roles to service account
echo ""
echo "--- Granting roles to service account..."
ROLES=(
  "roles/artifactregistry.writer"
  "roles/run.admin"
  "roles/iam.serviceAccountUser"
  "roles/secretmanager.secretAccessor"
)

for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --quiet 2>/dev/null || true
  echo "  OK: $role"
done

# Create Workload Identity Pool
echo ""
echo "--- Creating Workload Identity Pool: $POOL_NAME..."
if gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --location="global" --format="value(name)" 2>/dev/null; then
  echo "  OK: Pool already exists"
else
  gcloud iam workload-identity-pools create "$POOL_NAME" \
    --location="global" \
    --display-name="GitHub Actions Pool" \
    --quiet
  echo "  OK: Pool created"
fi

# Create OIDC Provider
echo ""
echo "--- Creating OIDC provider: $PROVIDER_NAME..."
if gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --format="value(name)" 2>/dev/null; then
  echo "  OK: Provider already exists"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
    --location="global" \
    --workload-identity-pool="$POOL_NAME" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_ORG}/${GITHUB_REPO}'" \
    --quiet
  echo "  OK: Provider created"
fi

# Bind service account to WIF
echo ""
echo "--- Binding service account to WIF..."
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}" \
  --quiet 2>/dev/null || true
echo "  OK: Binding created"

# Output
WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"

echo ""
echo "============================================="
echo "  WIF SETUP COMPLETE"
echo "============================================="
echo ""
echo "  Set these GitHub repository secrets:"
echo ""
echo "  GCP_WIF_PROVIDER:"
echo "    $WIF_PROVIDER"
echo ""
echo "  GCP_SA_EMAIL:"
echo "    $SA_EMAIL"
echo ""
echo "  In GitHub: Settings → Secrets and variables → Actions → New repository secret"
echo ""
