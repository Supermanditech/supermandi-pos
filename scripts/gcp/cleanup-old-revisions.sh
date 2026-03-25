#!/bin/bash
# GCP-STG-0619: Clean up Cloud Run revisions older than 30 days
echo "=== CLOUD RUN REVISION CLEANUP ==="
REGION="asia-south1"
SERVICES=(api-gateway main-backend retailer-admin supplier-portal superadmin landing)
CUTOFF=$(date -d '30 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -v-30d +%Y-%m-%dT%H:%M:%S 2>/dev/null)

if ! command -v gcloud &>/dev/null; then
  echo "⚠️ gcloud not available"
  echo "To clean up manually:"
  echo "  gcloud run revisions list --service=main-backend --region=$REGION --format='value(name,metadata.creationTimestamp)'"
  echo "  gcloud run revisions delete REVISION_NAME --region=$REGION --quiet"
  exit 0
fi

for svc in "${SERVICES[@]}"; do
  echo "--- $svc ---"
  OLD=$(gcloud run revisions list --service="$svc" --region="$REGION" \
    --filter="metadata.creationTimestamp<'$CUTOFF'" \
    --format='value(name)' 2>/dev/null)
  COUNT=$(echo "$OLD" | grep -c . 2>/dev/null || echo 0)
  echo "  Old revisions: $COUNT"
  if [ "$COUNT" -gt 0 ]; then
    echo "  To delete: echo \"\$OLD\" | xargs -I {} gcloud run revisions delete {} --region=$REGION --quiet"
  fi
done
echo "=== DRY RUN ONLY ==="
