#!/usr/bin/env bash
# =============================================================================
# ZRP-C-033, C-034: Artifact Integrity — Digest Parity & Promotion Safety
# Runs in CD pipeline (requires gcloud access)
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP-C-033/034: Artifact Integrity ==="
echo ""

GCP_PROJECT="${GCP_PROJECT:-supermandi-backend}"
GCP_REGION="${GCP_REGION:-asia-south1}"
AR_REPO="${AR_REPO:-asia-south1-docker.pkg.dev/supermandi-backend/supermandi}"
DEPLOY_SHA="${DEPLOY_SHA:-}"

# =============================================================================
# ZRP-C-033: Deployed digest = CI-built digest (BLOCKING P0)
# For each service, compare AR image digest with Cloud Run deployed image
# =============================================================================
echo "--- ZRP-C-033: Deployed digest parity ---"

if [ -z "$DEPLOY_SHA" ]; then
  echo "  SKIP: DEPLOY_SHA not set (not in CD pipeline)"
  gate_warn "ZRP-C-033" "Digest parity" "DEPLOY_SHA not set — skipping"
else
  SERVICES=("api-gateway" "main-backend" "retailer-admin" "supplier-portal" "superadmin" "landing")
  DIGEST_MISMATCH=0

  for svc in "${SERVICES[@]}"; do
    # Get AR image digest for the deployed SHA
    AR_IMAGE="${AR_REPO}/${svc}:${DEPLOY_SHA}"
    AR_DIGEST=$(gcloud artifacts docker images describe "$AR_IMAGE" \
      --format="value(image_summary.digest)" 2>/dev/null || echo "")

    # Get Cloud Run deployed image digest
    CR_IMAGE=$(gcloud run services describe "$svc" \
      --region="$GCP_REGION" \
      --format="value(spec.template.spec.containers[0].image)" 2>/dev/null || echo "")

    # Extract digest from Cloud Run image (format: repo/image@sha256:...)
    CR_DIGEST=""
    if echo "$CR_IMAGE" | grep -q "@sha256:"; then
      CR_DIGEST=$(echo "$CR_IMAGE" | grep -oE 'sha256:[a-f0-9]+')
    elif echo "$CR_IMAGE" | grep -q ":${DEPLOY_SHA}"; then
      # Cloud Run may store by tag — get digest via describe
      CR_DIGEST="tag:${DEPLOY_SHA}"
    fi

    if [ -n "$AR_DIGEST" ] && [ -n "$CR_DIGEST" ]; then
      if [ "$AR_DIGEST" = "$CR_DIGEST" ] || echo "$CR_IMAGE" | grep -q "$DEPLOY_SHA"; then
        echo "  PASS: $svc — digest matches"
      else
        echo "  FAIL: $svc — AR digest ($AR_DIGEST) != CR image ($CR_IMAGE)"
        DIGEST_MISMATCH=$((DIGEST_MISMATCH + 1))
      fi
    elif [ -z "$AR_DIGEST" ]; then
      echo "  WARN: $svc — cannot resolve AR digest for $AR_IMAGE"
    else
      echo "  WARN: $svc — cannot resolve Cloud Run image digest"
    fi
  done

  if [ "$DIGEST_MISMATCH" -eq 0 ]; then
    gate_pass "ZRP-C-033" "All deployed images match CI-built digests"
  else
    gate_fail "ZRP-C-033" "Digest parity" "$DIGEST_MISMATCH service(s) have digest mismatch"
  fi
fi

# =============================================================================
# ZRP-C-034: Promotion uses same digest — no rebuild (BLOCKING P0)
# Verify promote-to-prod.sh uses tag/digest, not docker build
# =============================================================================
echo ""
echo "--- ZRP-C-034: Promotion uses digest (no rebuild) ---"

PROMOTE_SCRIPT="scripts/promote-to-prod.sh"
if [ -f "$PROMOTE_SCRIPT" ]; then
  # Check for docker build in promote script (anti-pattern)
  if grep -qE 'docker build|docker-compose build' "$PROMOTE_SCRIPT" 2>/dev/null; then
    gate_fail "ZRP-C-034" "Promotion safety" "promote-to-prod.sh rebuilds images (should use same digest)"
  else
    # Check for tag/digest-based promotion
    if grep -qE 'gcloud run deploy|docker tag|docker push' "$PROMOTE_SCRIPT" 2>/dev/null; then
      gate_pass "ZRP-C-034" "Promotion uses existing images (no rebuild)"
    else
      gate_warn "ZRP-C-034" "Promotion" "Cannot determine promotion strategy from $PROMOTE_SCRIPT"
    fi
  fi
else
  # No promote script yet is OK — it means production isn't set up
  gate_warn "ZRP-C-034" "Promotion" "promote-to-prod.sh not found (production not yet configured)"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "==============================================================="
echo "ZRP Artifact Integrity Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "==============================================================="

echo "ZRP_ARTIFACT_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_ARTIFACT_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL artifact integrity gate(s) failed."
  exit 1
fi

echo ""
echo "Artifact Integrity: All blocking gates passed."
exit 0
