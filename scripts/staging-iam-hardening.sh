#!/usr/bin/env bash
# STAGE.SECURITY.IAM_EDITOR_ROLE.001 — Staging IAM Least-Privilege Migration
#
# Purpose: Audit and enforce least-privilege IAM on GCP staging.
#   1. Verify dedicated Cloud Run SAs exist (cloudrun-backend, cloudrun-frontend)
#   2. Grant minimum required roles to each SA
#   3. Verify all 6 Cloud Run services use the correct dedicated SA
#   4. Audit roles/editor on default compute SA
#   5. Remove roles/editor from default compute SA (if safe)
#
# Boundary: STAGING ONLY. NO production IAM or production service changes.
# Operator: Run from authenticated gcloud session with project owner/editor.
#
# Usage:
#   bash scripts/staging-iam-hardening.sh [--dry-run] [--remove-editor]
#
# Flags:
#   --dry-run         Show what would be done without making changes (default)
#   --remove-editor   Actually remove roles/editor from default compute SA
#
# Prerequisites:
#   - gcloud authenticated with project owner/editor
#   - Project: supermandi-backend
#   - Region: asia-south1

set -euo pipefail

PROJECT="supermandi-backend"
REGION="asia-south1"
DRY_RUN=true
REMOVE_EDITOR=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --remove-editor) REMOVE_EDITOR=true; DRY_RUN=false ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# Service account names (must match deploy.yml)
SA_BACKEND="cloudrun-backend@${PROJECT}.iam.gserviceaccount.com"
SA_FRONTEND="cloudrun-frontend@${PROJECT}.iam.gserviceaccount.com"
DEFAULT_COMPUTE_SA="807429885586-compute@developer.gserviceaccount.com"
GOOGLE_APIS_SA="807429885586@cloudservices.gserviceaccount.com"

# Cloud Run services and their expected SA
declare -A SERVICE_SA_MAP=(
  ["main-backend"]="$SA_BACKEND"
  ["api-gateway"]="$SA_BACKEND"
  ["retailer-admin"]="$SA_FRONTEND"
  ["supplier-portal"]="$SA_FRONTEND"
  ["superadmin"]="$SA_FRONTEND"
  ["landing"]="$SA_FRONTEND"
)

# Minimum required roles per SA
# Backend SA needs: Cloud SQL, Secret Manager, Logging, Monitoring, Storage
BACKEND_ROLES=(
  "roles/cloudsql.client"
  "roles/secretmanager.secretAccessor"
  "roles/logging.logWriter"
  "roles/monitoring.metricWriter"
  "roles/storage.objectAdmin"
  "roles/artifactregistry.reader"
)

# Frontend SA needs: Logging only (no DB, no secrets)
FRONTEND_ROLES=(
  "roles/logging.logWriter"
  "roles/monitoring.metricWriter"
)

echo "================================================================"
echo "STAGE.SECURITY.IAM_EDITOR_ROLE.001 — IAM Hardening Audit"
echo "================================================================"
echo "Project:  $PROJECT"
echo "Region:   $REGION"
echo "Mode:     $([ "$DRY_RUN" = true ] && echo 'DRY RUN' || echo 'LIVE')"
echo "Date:     $(date -Iseconds)"
echo ""

# ---- Phase 1: Verify dedicated SAs exist ----
echo "--- Phase 1: Verify Dedicated Service Accounts ---"
PHASE1_PASS=true

for sa in "$SA_BACKEND" "$SA_FRONTEND"; do
  SA_SHORT="${sa%%@*}"
  EXISTS=$(gcloud iam service-accounts describe "$sa" \
    --project="$PROJECT" \
    --format="value(email)" 2>/dev/null || echo "")
  if [ -n "$EXISTS" ]; then
    echo "  OK: $SA_SHORT exists"
  else
    echo "  MISSING: $SA_SHORT — creating..."
    if [ "$DRY_RUN" = true ]; then
      echo "    [DRY RUN] Would create: $sa"
    else
      gcloud iam service-accounts create "$SA_SHORT" \
        --project="$PROJECT" \
        --display-name="Cloud Run ${SA_SHORT##*-} runtime SA" \
        --description="Least-privilege SA for Cloud Run ${SA_SHORT##*-} services (STAGE.SECURITY.IAM_EDITOR_ROLE.001)"
      echo "    CREATED: $sa"
    fi
    PHASE1_PASS=false
  fi
done
echo ""

# ---- Phase 2: Grant minimum required roles ----
echo "--- Phase 2: Grant Minimum Required Roles ---"

grant_roles() {
  local sa="$1"
  shift
  local roles=("$@")
  local sa_short="${sa%%@*}"

  # Get current bindings for this SA
  CURRENT_ROLES=$(gcloud projects get-iam-policy "$PROJECT" \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:${sa}" \
    --format="value(bindings.role)" 2>/dev/null || echo "")

  for role in "${roles[@]}"; do
    if echo "$CURRENT_ROLES" | grep -qxF "$role"; then
      echo "  OK: $sa_short has $role"
    else
      echo "  MISSING: $sa_short needs $role"
      if [ "$DRY_RUN" = true ]; then
        echo "    [DRY RUN] Would grant: $role to $sa"
      else
        gcloud projects add-iam-policy-binding "$PROJECT" \
          --member="serviceAccount:${sa}" \
          --role="$role" \
          --condition=None \
          --quiet
        echo "    GRANTED: $role to $sa_short"
      fi
    fi
  done
}

echo "  Backend SA ($SA_BACKEND):"
grant_roles "$SA_BACKEND" "${BACKEND_ROLES[@]}"
echo ""
echo "  Frontend SA ($SA_FRONTEND):"
grant_roles "$SA_FRONTEND" "${FRONTEND_ROLES[@]}"
echo ""

# ---- Phase 3: Verify Cloud Run services use correct SA ----
echo "--- Phase 3: Verify Cloud Run Service Account Bindings ---"
PHASE3_PASS=true

for svc in "${!SERVICE_SA_MAP[@]}"; do
  EXPECTED_SA="${SERVICE_SA_MAP[$svc]}"
  ACTUAL_SA=$(gcloud run services describe "$svc" \
    --region="$REGION" \
    --format="value(spec.template.spec.serviceAccountName)" 2>/dev/null || echo "")

  if [ "$ACTUAL_SA" = "$EXPECTED_SA" ]; then
    echo "  OK: $svc → $ACTUAL_SA"
  else
    echo "  MISMATCH: $svc"
    echo "    Expected: $EXPECTED_SA"
    echo "    Actual:   ${ACTUAL_SA:-<default compute SA>}"
    PHASE3_PASS=false
  fi
done
echo ""

# ---- Phase 4: Audit roles/editor on default compute SA ----
echo "--- Phase 4: Audit roles/editor Bindings ---"

EDITOR_BINDINGS=$(gcloud projects get-iam-policy "$PROJECT" \
  --flatten="bindings[].members" \
  --filter="bindings.role=roles/editor" \
  --format="value(bindings.members)" 2>/dev/null || echo "")

echo "  Principals with roles/editor:"
if [ -z "$EDITOR_BINDINGS" ]; then
  echo "    (none — already clean)"
else
  echo "$EDITOR_BINDINGS" | while read -r member; do
    echo "    - $member"
  done
fi
echo ""

# Check if default compute SA has roles/editor
COMPUTE_HAS_EDITOR=false
if echo "$EDITOR_BINDINGS" | grep -qF "serviceAccount:${DEFAULT_COMPUTE_SA}"; then
  COMPUTE_HAS_EDITOR=true
  echo "  WARNING: Default compute SA has roles/editor"
  echo "    $DEFAULT_COMPUTE_SA → roles/editor"
fi

GOOGLE_HAS_EDITOR=false
if echo "$EDITOR_BINDINGS" | grep -qF "serviceAccount:${GOOGLE_APIS_SA}"; then
  GOOGLE_HAS_EDITOR=true
  echo "  INFO: Google APIs SA has roles/editor (GCP requirement — DO NOT REMOVE)"
  echo "    $GOOGLE_APIS_SA → roles/editor"
fi
echo ""

# ---- Phase 5: Remove roles/editor from default compute SA (if safe) ----
echo "--- Phase 5: Remove roles/editor from Default Compute SA ---"

if [ "$COMPUTE_HAS_EDITOR" = false ]; then
  echo "  SKIP: Default compute SA does not have roles/editor (already clean)"
elif [ "$PHASE3_PASS" = false ]; then
  echo "  BLOCKED: Cannot remove roles/editor — some Cloud Run services still use default compute SA"
  echo "  Fix Phase 3 first (redeploy services with dedicated SAs)"
elif [ "$REMOVE_EDITOR" = true ]; then
  echo "  Removing roles/editor from $DEFAULT_COMPUTE_SA..."
  gcloud projects remove-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${DEFAULT_COMPUTE_SA}" \
    --role="roles/editor" \
    --quiet
  echo "  REMOVED: roles/editor from default compute SA"
  echo ""
  echo "  Verifying removal..."
  VERIFY=$(gcloud projects get-iam-policy "$PROJECT" \
    --flatten="bindings[].members" \
    --filter="bindings.role=roles/editor AND bindings.members:serviceAccount:${DEFAULT_COMPUTE_SA}" \
    --format="value(bindings.members)" 2>/dev/null || echo "")
  if [ -z "$VERIFY" ]; then
    echo "  VERIFIED: roles/editor removed from default compute SA"
  else
    echo "  FAIL: roles/editor still present — manual investigation required"
  fi
else
  echo "  [DRY RUN] Would remove roles/editor from $DEFAULT_COMPUTE_SA"
  echo "  To execute: bash scripts/staging-iam-hardening.sh --remove-editor"
fi
echo ""

# ---- Phase 6: Post-change staging health verification ----
echo "--- Phase 6: Staging Health Verification ---"

HEALTH_OK=true
STAGING_URL="https://staging.supermandi.tech"

# Check api-gateway health
STATUS=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" "$STAGING_URL/health" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "  OK: api-gateway /health → 200"
else
  echo "  WARN: api-gateway /health → $STATUS"
  HEALTH_OK=false
fi

# Check main-backend via gateway
STATUS=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" "$STAGING_URL/api/v1/pos/health" 2>/dev/null || echo "000")
if [ "$STATUS" -ge 200 ] && [ "$STATUS" -lt 500 ]; then
  echo "  OK: main-backend via gateway → $STATUS"
else
  echo "  WARN: main-backend via gateway → $STATUS"
  HEALTH_OK=false
fi

# Check auth guard
STATUS=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" "$STAGING_URL/api/v1/admin/stores" 2>/dev/null || echo "000")
if [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; then
  echo "  OK: auth guard → $STATUS (enforced)"
else
  echo "  WARN: auth guard → $STATUS"
  HEALTH_OK=false
fi
echo ""

# ---- Summary ----
echo "================================================================"
echo "SUMMARY"
echo "================================================================"
echo "  Phase 1 — SAs exist:            $([ "$PHASE1_PASS" = true ] && echo 'PASS' || echo 'CREATED')"
echo "  Phase 2 — Roles granted:        AUDITED"
echo "  Phase 3 — CR service SA match:  $([ "$PHASE3_PASS" = true ] && echo 'PASS' || echo 'MISMATCH')"
echo "  Phase 4 — Editor audit:         $([ "$COMPUTE_HAS_EDITOR" = true ] && echo 'HAS roles/editor' || echo 'CLEAN')"
echo "  Phase 5 — Editor removal:       $([ "$REMOVE_EDITOR" = true ] && echo 'EXECUTED' || echo 'DRY RUN')"
echo "  Phase 6 — Health:               $([ "$HEALTH_OK" = true ] && echo 'PASS' || echo 'DEGRADED')"
echo ""
echo "Google APIs SA ($GOOGLE_APIS_SA): roles/editor KEPT (GCP requirement)"
echo ""

if [ "$PHASE3_PASS" = true ] && [ "$COMPUTE_HAS_EDITOR" = false ]; then
  echo "STATUS: CLEAN — All services on dedicated SAs, no broad editor role on compute SA"
elif [ "$PHASE3_PASS" = true ] && [ "$COMPUTE_HAS_EDITOR" = true ]; then
  echo "STATUS: READY — Services migrated, run with --remove-editor to complete"
else
  echo "STATUS: IN PROGRESS — Fix Phase 3 mismatches, then remove editor role"
fi
echo "================================================================"
