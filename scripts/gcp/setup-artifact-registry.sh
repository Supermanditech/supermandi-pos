#!/usr/bin/env bash
# CD-AR-001: Create Artifact Registry repository for SuperMandi Docker images
# Usage: ./scripts/gcp/setup-artifact-registry.sh [--project PROJECT] [--region REGION]
# Idempotent: safe to run multiple times

set -euo pipefail

PROJECT="${GCP_PROJECT:-supermandi-backend}"
REGION="${GCP_REGION:-asia-south1}"
REPO_NAME="supermandi"

while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "============================================="
echo "  Artifact Registry Setup"
echo "  Project: $PROJECT"
echo "  Region:  $REGION"
echo "  Repo:    $REPO_NAME"
echo "============================================="
echo ""

# Check gcloud auth
echo "--- Checking gcloud authentication..."
gcloud auth print-identity-token > /dev/null 2>&1 || {
  echo "FAIL: Not authenticated. Run: gcloud auth login"
  exit 1
}
echo "  OK: Authenticated"

# Set project
gcloud config set project "$PROJECT" --quiet

# Enable Artifact Registry API
echo ""
echo "--- Enabling Artifact Registry API..."
gcloud services enable artifactregistry.googleapis.com --quiet
echo "  OK: API enabled"

# Create repository (idempotent)
echo ""
echo "--- Creating Docker repository: $REPO_NAME..."
if gcloud artifacts repositories describe "$REPO_NAME" \
  --location="$REGION" --format="value(name)" 2>/dev/null; then
  echo "  OK: Repository already exists"
else
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="SuperMandi Docker images" \
    --quiet
  echo "  OK: Repository created"
fi

# Configure Docker auth
echo ""
echo "--- Configuring Docker auth for AR..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
echo "  OK: Docker configured"

# Verify
echo ""
echo "--- Verification..."
gcloud artifacts repositories describe "$REPO_NAME" \
  --location="$REGION" \
  --format="table(name,format,sizeBytes,createTime)"

echo ""
echo "============================================="
echo "  ARTIFACT REGISTRY SETUP COMPLETE"
echo "============================================="
echo ""
echo "  Registry URL: ${REGION}-docker.pkg.dev/${PROJECT}/${REPO_NAME}"
echo ""
echo "  Push example:"
echo "    docker push ${REGION}-docker.pkg.dev/${PROJECT}/${REPO_NAME}/api-gateway:SHA"
echo ""
