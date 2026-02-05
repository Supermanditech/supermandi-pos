#!/usr/bin/env bash
# CD-DEPLOY-001: Deploy all SuperMandi services to Cloud Run
# Usage:
#   ./scripts/deploy-cloud-run.sh --env staging --sha abc1234
#   ./scripts/deploy-cloud-run.sh --env production --sha abc1234 --confirm
#
# Deploys all 14 services (10 backend + 4 frontend) from Artifact Registry.
# Production requires --confirm flag.

set -euo pipefail

# Defaults
ENV=""
SHA=""
CONFIRM=""
DRY_RUN=""
PROJECT="${GCP_PROJECT:-supermandi-pos}"
REGION="${GCP_REGION:-asia-south1}"
AR_REPO="${REGION}-docker.pkg.dev/${PROJECT}/supermandi"
VPC_CONNECTOR="projects/${PROJECT}/locations/${REGION}/connectors/supermandi-vpc"

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
    --set-env-vars="NODE_ENV=$ENV,GIT_SHA=$SHA" \
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
# Backend services (10)
# =============================================================================
echo "=== Backend Services ==="

BACKEND_SERVICES=(
  api-gateway auth-service catalog-service inventory-service
  order-service payment-service platform-service reorder-service
  supplier-service voice-service
)

BACKEND_FLAGS="--vpc-connector=$VPC_CONNECTOR --vpc-egress=private-ranges-only --set-secrets=DB_PASSWORD=postgres-password:latest,JWT_SECRET=jwt-secret:latest,ADMIN_TOKEN=admin-token:latest"

for svc in "${BACKEND_SERVICES[@]}"; do
  run_deploy "$svc" "${AR_REPO}/${svc}:${SHA}" "512Mi" "false" "$BACKEND_FLAGS"
done

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
  echo "  ALL 14 SERVICES DEPLOYED TO $ENV"
  echo ""
  if [ "$ENV" = "staging" ]; then
    echo "  Next: Test staging, then promote:"
    echo "    ./scripts/promote-to-prod.sh $SHA --confirm"
  fi
fi
