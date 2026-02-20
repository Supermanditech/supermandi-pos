#!/usr/bin/env bash
# CD-DEPLOY-001: Deploy all SuperMandi services to Cloud Run
# Usage:
#   ./scripts/deploy-cloud-run.sh --env staging --sha abc1234
#   ./scripts/deploy-cloud-run.sh --env production --sha abc1234 --confirm
#
# Production-grade safeguards:
# - staging/prod target separation is mandatory
# - immutable image digest deploys (no mutable tag deploy)
# - pinned secret versions (no :latest)
# - production deploys require operator principal allowlist + pipeline context
# - fail-fast + rollback previously deployed services on failure

set -euo pipefail

ENV=""
SHA=""
CONFIRM=""
DRY_RUN=""
PROJECT="${GCP_PROJECT:-supermandi-backend}"
REGION="${GCP_REGION:-asia-south1}"
AR_REPO="${REGION}-docker.pkg.dev/${PROJECT}/supermandi"
VPC_CONNECTOR="projects/${PROJECT}/locations/${REGION}/connectors/supermandi-connector"
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORKFLOW_STATE_FILE="${WORKFLOW_STATE_FILE:-${REPO_ROOT}/workflow/state/workflow_state.json}"

# Shared production boundary checks (identity + pipeline context).
source "${REPO_ROOT}/scripts/workflow/production-identity-guard.sh"

WORKFLOW_ACTOR="${WORKFLOW_ACTOR:-claude}"
ENABLE_PRODUCTION_DEPLOY="${ENABLE_PRODUCTION_DEPLOY:-false}"

STAGING_PREFIX="${CLOUD_RUN_STAGING_PREFIX:-}"
STAGING_SUFFIX="${CLOUD_RUN_STAGING_SUFFIX:--staging}"
PRODUCTION_PREFIX="${CLOUD_RUN_PRODUCTION_PREFIX:-}"
PRODUCTION_SUFFIX="${CLOUD_RUN_PRODUCTION_SUFFIX:-}"

DB_PASSWORD_SECRET_VERSION="${DB_PASSWORD_SECRET_VERSION:-}"
JWT_SECRET_VERSION="${JWT_SECRET_VERSION:-}"
ADMIN_TOKEN_SECRET_VERSION="${ADMIN_TOKEN_SECRET_VERSION:-}"

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

if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
  echo "ERROR: --env must be staging or production"
  exit 1
fi

if [ "$SHA" = "latest" ]; then
  echo "ERROR: ':latest' tag is FORBIDDEN. Use a specific git SHA."
  exit 1
fi

if [ "$ENV" = "production" ] && [ "$CONFIRM" != "yes" ]; then
  echo "ERROR: Production deploy requires --confirm flag"
  echo "Usage: ./scripts/deploy-cloud-run.sh --env production --sha $SHA --confirm"
  exit 1
fi

if [ "$ENV" = "production" ]; then
  if [ "$WORKFLOW_ACTOR" != "operator" ]; then
    echo "ERROR: Production deploy is restricted to operator role (set WORKFLOW_ACTOR=operator)."
    exit 1
  fi
  if [ "$ENABLE_PRODUCTION_DEPLOY" != "true" ]; then
    echo "ERROR: Production deploy requires ENABLE_PRODUCTION_DEPLOY=true."
    exit 1
  fi
  workflow_guard_require_production_boundary "production deploy" "$WORKFLOW_STATE_FILE"
fi

if [ "$ENV" = "staging" ]; then
  echo "--- Workflow guard: staging deploy eligibility"
  node "$REPO_ROOT/scripts/workflow/guard.js" pre-staging-deploy
fi

require_secret_version() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "ERROR: $name must be explicitly set to a numeric/immutable secret version."
    exit 1
  fi
  if [ "$value" = "latest" ]; then
    echo "ERROR: $name cannot be 'latest'. Pin exact secret versions."
    exit 1
  fi
}

require_secret_version "DB_PASSWORD_SECRET_VERSION" "$DB_PASSWORD_SECRET_VERSION"
require_secret_version "JWT_SECRET_VERSION" "$JWT_SECRET_VERSION"
require_secret_version "ADMIN_TOKEN_SECRET_VERSION" "$ADMIN_TOKEN_SECRET_VERSION"

resolve_target_service() {
  local base_service="$1"
  if [ "$ENV" = "staging" ]; then
    printf "%s%s%s" "$STAGING_PREFIX" "$base_service" "$STAGING_SUFFIX"
  else
    printf "%s%s%s" "$PRODUCTION_PREFIX" "$base_service" "$PRODUCTION_SUFFIX"
  fi
}

ensure_target_isolation() {
  local services=(api-gateway main-backend retailer-admin supplier-portal superadmin landing)
  for base in "${services[@]}"; do
    local staging_target
    local prod_target
    staging_target="${STAGING_PREFIX}${base}${STAGING_SUFFIX}"
    prod_target="${PRODUCTION_PREFIX}${base}${PRODUCTION_SUFFIX}"
    if [ "$staging_target" = "$prod_target" ]; then
      echo "ERROR: staging and production target collision for service '${base}' (${staging_target})."
      echo "Set CLOUD_RUN_STAGING_* and CLOUD_RUN_PRODUCTION_* prefixes/suffixes to distinct values."
      exit 1
    fi
  done
}

ensure_target_isolation

resolve_image_ref() {
  local base_service="$1"
  local version_ref
  version_ref=$(gcloud artifacts docker tags list "${AR_REPO}/${base_service}" \
    --filter="tag=${SHA}" \
    --format="value(version)" \
    --limit=1 2>/dev/null || true)

  if [ -z "$version_ref" ]; then
    echo ""
    echo "ERROR: Immutable image ref for ${base_service}:${SHA} not found in Artifact Registry."
    echo "Build/push the image first."
    exit 1
  fi

  printf "%s" "$version_ref"
}

service_exists() {
  local target_service="$1"
  gcloud run services describe "$target_service" --region="$REGION" >/dev/null 2>&1
}

current_revision() {
  local target_service="$1"
  gcloud run services describe "$target_service" \
    --region="$REGION" \
    --format="value(status.latestReadyRevisionName)" 2>/dev/null || true
}

declare -a DEPLOYED_HISTORY=()
DEPLOY_COUNT=0

rollback_deploys() {
  if [ "${#DEPLOYED_HISTORY[@]}" -eq 0 ]; then
    return
  fi

  echo ""
  echo "--- Rolling back previously deployed services..."
  for ((idx=${#DEPLOYED_HISTORY[@]}-1; idx>=0; idx--)); do
    local entry
    local target_service
    local previous_revision
    entry="${DEPLOYED_HISTORY[$idx]}"
    target_service="${entry%%|*}"
    previous_revision="${entry##*|}"

    if [ -z "$previous_revision" ]; then
      echo "    WARN: No previous revision for $target_service; skipping rollback."
      continue
    fi

    if gcloud run services update-traffic "$target_service" \
      --to-revisions="${previous_revision}=100" \
      --region="$REGION" \
      --quiet >/dev/null 2>&1; then
      echo "    OK: rolled back $target_service -> $previous_revision"
    else
      echo "    WARN: rollback failed for $target_service"
    fi
  done
}

on_deploy_error() {
  echo ""
  echo "ERROR: Deploy failed. Initiating rollback of already updated services."
  rollback_deploys
}
trap on_deploy_error ERR

echo "============================================="
echo "  Cloud Run Deploy — $ENV"
echo "  SHA: $SHA"
echo "  Actor: $WORKFLOW_ACTOR"
echo "  Project: $PROJECT"
echo "  Region: $REGION"
echo "  Registry: $AR_REPO"
echo "============================================="
echo ""

run_deploy() {
  local base_service="$1"
  local memory="$2"
  local allow_unauth="$3"
  shift 3
  local extra_flags=("$@")

  local target_service
  local image_ref
  local previous_revision
  local auth_flag
  local ingress_mode
  local min_instances=0
  local max_instances=3

  target_service="$(resolve_target_service "$base_service")"
  image_ref="$(resolve_image_ref "$base_service")"

  if ! service_exists "$target_service"; then
    echo "ERROR: Target Cloud Run service does not exist: $target_service"
    exit 1
  fi

  previous_revision="$(current_revision "$target_service")"
  auth_flag="--no-allow-unauthenticated"
  if [ "$allow_unauth" = "true" ]; then
    auth_flag="--allow-unauthenticated"
  fi
  ingress_mode="all"
  if [ "$ENV" = "staging" ]; then
    # Enforce staging edge boundary via LB; avoid direct run.app access.
    ingress_mode="internal-and-cloud-load-balancing"
  fi

  if [ "$ENV" = "production" ]; then
    min_instances=1
    max_instances=10
  fi

  echo "--- Deploying: $target_service"
  echo "    Base service: $base_service"
  echo "    Image (immutable): $image_ref"
  echo "    Previous revision: ${previous_revision:-none}"

  if [ -n "$DRY_RUN" ]; then
    echo "    [DRY-RUN] Would deploy $target_service"
    DEPLOY_COUNT=$((DEPLOY_COUNT + 1))
    return
  fi

  gcloud run deploy "$target_service" \
    --image="$image_ref" \
    --region="$REGION" \
    --platform=managed \
    --ingress="$ingress_mode" \
    --memory="$memory" \
    --cpu=1 \
    --min-instances="$min_instances" \
    --max-instances="$max_instances" \
    --set-env-vars="NODE_ENV=$ENV,GIT_SHA=$SHA,MIN_APP_VERSION=$APP_VERSION" \
    "${extra_flags[@]}" \
    $auth_flag \
    --quiet >/dev/null

  DEPLOYED_HISTORY+=("${target_service}|${previous_revision}")
  DEPLOY_COUNT=$((DEPLOY_COUNT + 1))
  echo "    OK: $target_service"
}

APP_VERSION=$(node -p "require('./app.json').expo.version" 2>/dev/null || echo "unknown")

MAIN_BACKEND_SECRETS="DB_PASSWORD=postgres-password:${DB_PASSWORD_SECRET_VERSION},JWT_SECRET=jwt-secret:${JWT_SECRET_VERSION},ADMIN_TOKEN=admin-token:${ADMIN_TOKEN_SECRET_VERSION}"
GW_SECRETS="JWT_SECRET=jwt-secret:${JWT_SECRET_VERSION},ADMIN_TOKEN=admin-token:${ADMIN_TOKEN_SECRET_VERSION}"

MAIN_BACKEND_TARGET="$(resolve_target_service "main-backend")"
API_GATEWAY_TARGET="$(resolve_target_service "api-gateway")"

echo "=== Backend Services ==="
run_deploy "main-backend" "512Mi" "false" \
  "--vpc-connector=$VPC_CONNECTOR" \
  "--vpc-egress=private-ranges-only" \
  "--set-secrets=$MAIN_BACKEND_SECRETS"

MAIN_BACKEND_URL=$(gcloud run services describe "$MAIN_BACKEND_TARGET" \
  --region="$REGION" \
  --format="value(status.url)" 2>/dev/null || true)

if [ -z "$MAIN_BACKEND_URL" ]; then
  echo "ERROR: Unable to resolve URL for $MAIN_BACKEND_TARGET after deploy."
  exit 1
fi

run_deploy "api-gateway" "512Mi" "true" \
  "--vpc-connector=$VPC_CONNECTOR" \
  "--vpc-egress=private-ranges-only" \
  "--set-secrets=$GW_SECRETS" \
  "--set-env-vars=ADMIN_SERVICE_URL=$MAIN_BACKEND_URL"

echo ""
echo "=== Frontend Portals ==="
run_deploy "retailer-admin" "256Mi" "true"
run_deploy "supplier-portal" "256Mi" "true"
run_deploy "superadmin" "256Mi" "true"
run_deploy "landing" "256Mi" "true"

trap - ERR

echo ""
echo "============================================="
echo "  DEPLOY SUMMARY — $ENV — SHA: $SHA"
echo "============================================="
echo "  Services deployed: $DEPLOY_COUNT / 6"
echo "  Mode: fail-fast with rollback protection"
echo ""
echo "  ALL SERVICES DEPLOYED TO $ENV"
if [ "$ENV" = "staging" ]; then
  echo ""
  echo "  Next: operator validates staging, then approve promote."
  echo "    ./scripts/promote-to-prod.sh $SHA --confirm"
fi
