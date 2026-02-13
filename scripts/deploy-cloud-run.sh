#!/usr/bin/env bash
# CD-DEPLOY-001: Deploy all SuperMandi services to Cloud Run
# Usage:
#   ./scripts/deploy-cloud-run.sh --env staging --sha abc1234
#   ./scripts/deploy-cloud-run.sh --env production --sha abc1234 --confirm
#
# Deploys all 6 services (2 backend + 4 frontend) from Artifact Registry.
# Production requires --confirm flag.

set -euo pipefail

# Defaults
ENV=""
SHA=""
CONFIRM=""
DRY_RUN=""
PROJECT="${GCP_PROJECT:-supermandi-backend}"
REGION="${GCP_REGION:-asia-south1}"
AR_REPO="${REGION}-docker.pkg.dev/${PROJECT}/supermandi"
VPC_CONNECTOR="projects/${PROJECT}/locations/${REGION}/connectors/supermandi-connector"

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV="$2"; shift 2 ;;
    --sha) SHA="$2"; shift 2 ;;
    --confirm) CONFIRM="yes"; shift ;;
    --dry-run) DRY_RUN="yes"; shift ;;
    --project) PROJECT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$ENV" ] || [ -z "$SHA" ]; then
  echo "Usage: ./scripts/deploy-cloud-run.sh --env staging|production --sha <sha>"
  exit 1
fi

if [ "$ENV" = "production" ] && [ "$CONFIRM" != "yes" ]; then
  echo "ERROR: Production deploy requires --confirm flag"
  echo "Usage: ./scripts/deploy-cloud-run.sh --env production --sha $SHA --confirm"
  exit 1
fi

# CD-201: Block :latest tag
if [ "$SHA" = "latest" ]; then
  echo "ERROR: ':latest' tag is FORBIDDEN. Use a specific git SHA."
  exit 1
fi

ENV_SUFFIX=""
if [ "$ENV" = "staging" ]; then
  ENV_SUFFIX="-staging"
fi

# SA-P2-003-AUTO: Extract POS app version from app.json for min-version enforcement
APP_VERSION=$(node -p "require('./app.json').expo.version" 2>/dev/null || echo "unknown")

PASSED=0
FAILED=0
FAILURES=""

echo "============================================="
echo "  Cloud Run Deploy — $ENV"
echo "  SHA: $SHA"
echo "  Project: $PROJECT"
echo "  Region: $REGION"
echo "  Registry: $AR_REPO"
echo "============================================="
echo ""

run_deploy() {
  local service_name=$1
  local image=$2
  local memory=${3:-512Mi}
  local allow_unauth=${4:-false}
  local extra_flags=${5:-}

  local cr_name="supermandi-${service_name}${ENV_SUFFIX}"

  echo "--- Deploying: $cr_name"
  echo "    Image: $image"

  if [ -n "$DRY_RUN" ]; then
    echo "    [DRY-RUN] Would deploy $cr_name"
    PASSED=$((PASSED + 1))
    return
  fi

  local auth_flag="--no-allow-unauthenticated"
  if [ "$allow_unauth" = "true" ]; then
    auth_flag="--allow-unauthenticated"
  fi

  local min_instances=0
  local max_instances=3
  if [ "$ENV" = "production" ]; then
    min_instances=1
    max_instances=10
  fi

  if gcloud run deploy "$cr_name" \
    --image="$image" \
    --region="$REGION" \
    --platform=managed \
    --memory="$memory" \
    --cpu=1 \
    --min-instances="$min_instances" \
    --max-instances="$max_instances" \
    --set-env-vars="NODE_ENV=$ENV,GIT_SHA=$SHA,MIN_APP_VERSION=$APP_VERSION" \
    $extra_flags \
    $auth_flag \
    --quiet 2>&1; then
    echo "    OK: $cr_name"
    PASSED=$((PASSED + 1))
  else
    echo "    FAIL: $cr_name"
    FAILED=$((FAILED + 1))
    FAILURES="${FAILURES}\n  - ${service_name}"
  fi
}

# =============================================================================
# Backend services (2: api-gateway + main-backend)
# =============================================================================
echo "=== Backend Services ==="

MAIN_BACKEND_FLAGS="--vpc-connector=$VPC_CONNECTOR --vpc-egress=private-ranges-only --set-secrets=DB_PASSWORD=postgres-password:latest,JWT_SECRET=jwt-secret:latest,ADMIN_TOKEN=admin-token:latest"

# Deploy main-backend first (api-gateway depends on its URL)
run_deploy "main-backend" "${AR_REPO}/main-backend:${SHA}" "512Mi" "false" "$MAIN_BACKEND_FLAGS"

# Get main-backend URL for api-gateway
MB_URL=$(gcloud run services describe "supermandi-main-backend${ENV_SUFFIX}" \
  --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "")

GW_FLAGS="--vpc-connector=$VPC_CONNECTOR --vpc-egress=private-ranges-only --set-secrets=JWT_SECRET=jwt-secret:latest,ADMIN_TOKEN=admin-token:latest"
if [ -n "$MB_URL" ]; then
  GW_FLAGS="$GW_FLAGS --set-env-vars=ADMIN_SERVICE_URL=$MB_URL"
fi

run_deploy "api-gateway" "${AR_REPO}/api-gateway:${SHA}" "512Mi" "true" "$GW_FLAGS"

# =============================================================================
# Frontend portals (4)
# =============================================================================
echo ""
echo "=== Frontend Portals ==="

run_deploy "retailer-admin"  "${AR_REPO}/retailer-admin:${SHA}"  "256Mi" "true"
run_deploy "supplier-portal" "${AR_REPO}/supplier-portal:${SHA}" "256Mi" "true"
run_deploy "superadmin"      "${AR_REPO}/superadmin:${SHA}"      "256Mi" "true"
run_deploy "landing"         "${AR_REPO}/landing:${SHA}"         "256Mi" "true"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo "  DEPLOY SUMMARY — $ENV — SHA: $SHA"
echo "============================================="
echo "  Passed: $PASSED / $((PASSED + FAILED))"
echo "  Failed: $FAILED"
if [ $FAILED -gt 0 ]; then
  echo -e "  Failures: $FAILURES"
  echo ""
  echo "  DEPLOY INCOMPLETE"
  exit 1
else
  echo ""
  echo "  ALL 6 SERVICES DEPLOYED TO $ENV"
  echo ""
  if [ "$ENV" = "staging" ]; then
    echo "  Next: Test staging, then promote:"
    echo "    ./scripts/promote-to-prod.sh $SHA --confirm"
  fi
fi
