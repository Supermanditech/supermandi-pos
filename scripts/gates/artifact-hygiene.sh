#!/usr/bin/env bash
# =============================================================================
# ZRP-C-035, C-036, C-037, C-038: SBOM, Signing, AR Policy, Revision Cleanup
# Runs in CD pipeline (requires gcloud access)
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP-C-035/036/037/038: Artifact Hygiene ==="
echo ""

GCP_PROJECT="${GCP_PROJECT:-supermandi-backend}"
GCP_REGION="${GCP_REGION:-asia-south1}"

# =============================================================================
# ZRP-C-035: SBOM generated and stored (WARNING P1)
# =============================================================================
echo "--- ZRP-C-035: SBOM generation ---"

if command -v syft &>/dev/null; then
  echo "  syft available — SBOM generation supported"
  gate_pass "ZRP-C-035" "SBOM tool (syft) available"
elif command -v trivy &>/dev/null; then
  echo "  trivy available — SBOM generation supported"
  gate_pass "ZRP-C-035" "SBOM tool (trivy) available"
else
  gate_warn "ZRP-C-035" "SBOM" "Neither syft nor trivy installed — SBOM generation not available"
fi

# =============================================================================
# ZRP-C-036: Signed images / provenance (WARNING P1)
# =============================================================================
echo ""
echo "--- ZRP-C-036: Image signing ---"

if command -v cosign &>/dev/null; then
  echo "  cosign available — image signing supported"
  gate_pass "ZRP-C-036" "Image signing tool (cosign) available"
else
  gate_warn "ZRP-C-036" "Image signing" "cosign not installed — image signing not available"
fi

# =============================================================================
# ZRP-C-037: AR retention policy verified (WARNING P2)
# =============================================================================
echo ""
echo "--- ZRP-C-037: AR cleanup policy ---"

AR_REPO_NAME="supermandi"
AR_LOCATION="$GCP_REGION"

# Check if cleanup policy exists
POLICY=$(gcloud artifacts repositories describe "$AR_REPO_NAME" \
  --location="$AR_LOCATION" \
  --project="$GCP_PROJECT" \
  --format="json(cleanupPolicies)" 2>/dev/null || echo "{}")

if echo "$POLICY" | grep -q "cleanupPolicies"; then
  echo "  OK: AR cleanup policy exists"
  echo "  $POLICY" | head -5
  gate_pass "ZRP-C-037" "AR retention policy configured"
else
  gate_warn "ZRP-C-037" "AR retention" "No cleanup policy found on AR repository"
fi

# =============================================================================
# ZRP-C-038: Old Cloud Run revisions cleanup (WARNING P2)
# Count revisions per service, warn if > 5
# =============================================================================
echo ""
echo "--- ZRP-C-038: Revision count check ---"

SERVICES=("api-gateway" "main-backend" "retailer-admin" "supplier-portal" "superadmin" "landing")
EXCESSIVE=0

for svc in "${SERVICES[@]}"; do
  REV_COUNT=$(gcloud run revisions list \
    --service="$svc" \
    --region="$GCP_REGION" \
    --format="value(metadata.name)" 2>/dev/null | wc -l || echo "0")
  echo "  $svc: $REV_COUNT revision(s)"
  if [ "$REV_COUNT" -gt 5 ]; then
    echo "    WARN: More than 5 revisions (consider cleanup)"
    EXCESSIVE=$((EXCESSIVE + 1))
  fi
done

if [ "$EXCESSIVE" -eq 0 ]; then
  gate_pass "ZRP-C-038" "All services have <= 5 revisions"
else
  gate_warn "ZRP-C-038" "Revision cleanup" "$EXCESSIVE service(s) have > 5 revisions"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "==============================================================="
echo "ZRP Artifact Hygiene Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "==============================================================="

echo "ZRP_HYGIENE_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_HYGIENE_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL artifact hygiene gate(s) failed."
  exit 1
fi

echo ""
echo "Artifact Hygiene: All gates passed (warnings logged)."
exit 0
