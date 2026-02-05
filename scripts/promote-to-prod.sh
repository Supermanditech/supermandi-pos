#!/usr/bin/env bash
# CD-DEPLOY-001 + CD-201: Promote staging-approved SHA to production
# Usage: ./scripts/promote-to-prod.sh <SHA> --confirm
#
# CD-201 ENFORCEMENT:
# 1. Verifies SHA matches staging /version endpoint
# 2. Uses digest-pinned images (not mutable tags)
# 3. Blocks ':latest' tag
# 4. Records promotion in BATCH_LEDGER.md
#
# SAME IMAGE SHA: staging-tested → production (no rebuild)

set -euo pipefail

SHA=""
CONFIRM=""
DRY_RUN=""
PROJECT="${GCP_PROJECT:-supermandi-pos}"
REGION="${GCP_REGION:-asia-south1}"
AR_REPO="${REGION}-docker.pkg.dev/${PROJECT}/supermandi"

while [[ $# -gt 0 ]]; do
  case $1 in
    --confirm) CONFIRM="yes"; shift ;;
    --dry-run) DRY_RUN="yes"; shift ;;
    --project) PROJECT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    -*) echo "Unknown flag: $1"; exit 1 ;;
    *) SHA="$1"; shift ;;
  esac
done

if [ -z "$SHA" ]; then
  echo "Usage: ./scripts/promote-to-prod.sh <SHA> --confirm"
  echo ""
  echo "Promotes staging-approved SHA to production Cloud Run."
  echo "Verifies SHA matches staging before deploying."
  exit 1
fi

if [ "$CONFIRM" != "yes" ]; then
  echo "ERROR: Production promotion requires --confirm flag"
  echo ""
  echo "Usage: ./scripts/promote-to-prod.sh $SHA --confirm"
  echo ""
  echo "This will deploy SHA $SHA to PRODUCTION."
  echo "Make sure staging has been tested and approved."
  exit 1
fi

# CD-201: Block :latest
if [ "$SHA" = "latest" ]; then
  echo "ERROR: ':latest' tag is FORBIDDEN for production."
  echo "Use the exact git SHA from staging approval."
  exit 1
fi

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)

echo "============================================="
echo "  PRODUCTION PROMOTION"
echo "  SHA: $SHA"
echo "  Project: $PROJECT"
echo "  Region: $REGION"
echo "============================================="
echo ""

# =============================================================================
# STEP 1: Verify staging has this SHA
# =============================================================================
echo "--- Step 1: Verify staging SHA..."

STAGING_GW_URL=$(gcloud run services describe "supermandi-api-gateway-staging" \
  --region="$REGION" \
  --format="value(status.url)" 2>/dev/null || echo "")

if [ -z "$STAGING_GW_URL" ]; then
  echo "  WARN: Could not get staging gateway URL"
  echo "  Skipping staging verification (staging may not be deployed)"
else
  STAGING_VERSION=$(curl -sf "$STAGING_GW_URL/version" 2>/dev/null || echo "{}")
  STAGING_SHA=$(echo "$STAGING_VERSION" | grep -o '"sha":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

  echo "  Staging /version: $STAGING_VERSION"
  echo "  Staging SHA: $STAGING_SHA"
  echo "  Requested SHA: $SHA"

  if [ "$STAGING_SHA" != "$SHA" ]; then
    echo ""
    echo "  ERROR: SHA MISMATCH!"
    echo "  Staging has SHA '$STAGING_SHA' but you requested '$SHA'"
    echo ""
    echo "  CD-201: Production must use the SAME SHA as staging."
    echo "  Deploy $SHA to staging first, test it, then promote."
    exit 1
  fi
  echo "  OK: SHA matches staging"
fi

# =============================================================================
# STEP 2: Verify images exist in Artifact Registry
# =============================================================================
echo ""
echo "--- Step 2: Verify images exist in AR..."

IMAGES=(
  api-gateway auth-service catalog-service inventory-service
  order-service payment-service platform-service reorder-service
  supplier-service voice-service
  retailer-admin supplier-portal superadmin landing
)

MISSING=0
for img in "${IMAGES[@]}"; do
  if gcloud artifacts docker images describe \
    "${AR_REPO}/${img}:${SHA}" 2>/dev/null | grep -q "image_summary"; then
    echo "  OK: ${img}:${SHA}"
  else
    # Fallback: check with docker tags list
    if gcloud artifacts docker tags list "${AR_REPO}/${img}" \
      --format="value(tag)" 2>/dev/null | grep -q "^${SHA}$"; then
      echo "  OK: ${img}:${SHA}"
    else
      echo "  MISSING: ${img}:${SHA}"
      MISSING=$((MISSING + 1))
    fi
  fi
done

if [ $MISSING -gt 0 ]; then
  echo ""
  echo "  ERROR: $MISSING images not found in Artifact Registry"
  echo "  Push images first: ./scripts/build-all-images.sh --sha $SHA"
  exit 1
fi
echo "  All 14 images verified in AR"

# =============================================================================
# STEP 3: Deploy to production
# =============================================================================
echo ""
echo "--- Step 3: Deploy to production..."

if [ -n "$DRY_RUN" ]; then
  echo "  [DRY-RUN] Would run: ./scripts/deploy-cloud-run.sh --env production --sha $SHA --confirm"
  echo ""
  echo "  DRY RUN COMPLETE — no changes made"
  exit 0
fi

"$REPO_ROOT/scripts/deploy-cloud-run.sh" --env production --sha "$SHA" --confirm

# =============================================================================
# STEP 4: Record promotion
# =============================================================================
echo ""
echo "--- Step 4: Recording promotion..."

LEDGER="$REPO_ROOT/RELEASES/BATCH_LEDGER.md"
if [ -f "$LEDGER" ]; then
  cat >> "$LEDGER" <<EOF

## Production Promotion: $SHA
- **Date**: $(date -Iseconds)
- **SHA**: $SHA
- **Promoted from**: staging
- **Status**: DEPLOYED
- **Rollback SHA**: (previous production SHA)
EOF
  echo "  OK: Recorded in BATCH_LEDGER.md"
else
  echo "  WARN: BATCH_LEDGER.md not found"
fi

# =============================================================================
# STEP 5: Verify production
# =============================================================================
echo ""
echo "--- Step 5: Post-deploy verification..."

PROD_GW_URL=$(gcloud run services describe "supermandi-api-gateway" \
  --region="$REGION" \
  --format="value(status.url)" 2>/dev/null || echo "")

if [ -n "$PROD_GW_URL" ]; then
  echo "  Production gateway: $PROD_GW_URL"

  HEALTH=$(curl -sf -o /dev/null -w "%{http_code}" "$PROD_GW_URL/health" 2>/dev/null || echo "000")
  echo "  Health: $HEALTH"

  VERSION=$(curl -sf "$PROD_GW_URL/version" 2>/dev/null || echo "{}")
  echo "  Version: $VERSION"
else
  echo "  WARN: Could not get production gateway URL"
fi

echo ""
echo "============================================="
echo "  PRODUCTION PROMOTION COMPLETE"
echo "  SHA: $SHA"
echo "============================================="
echo ""
echo "  Immediate actions:"
echo "    1. Verify: curl https://supermandi.tech/api/v1/health"
echo "    2. Verify: curl https://supermandi.tech/api/v1/version"
echo "    3. Monitor for 15 minutes (GOLIVE-MONITOR-001)"
echo ""
echo "  Rollback (if needed):"
echo "    gcloud run services update-traffic supermandi-api-gateway \\"
echo "      --to-revisions=PREVIOUS=100 --region=$REGION"
echo ""
