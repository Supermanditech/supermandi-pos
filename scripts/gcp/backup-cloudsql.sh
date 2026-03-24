#!/bin/bash
# GCP-STG-0595: Cloud SQL backup before migration
INSTANCE="${1:-supermandi-staging}"
DESCRIPTION="Pre-migration backup $(date +%Y%m%d_%H%M)"

echo "=== CLOUD SQL BACKUP ==="
echo "Instance: $INSTANCE"
echo "Description: $DESCRIPTION"

if command -v gcloud &>/dev/null; then
  gcloud sql backups create --instance="$INSTANCE" --description="$DESCRIPTION"
  echo "✅ Backup created: $DESCRIPTION"
  echo ""
  echo "Recent backups:"
  gcloud sql backups list --instance="$INSTANCE" --limit=5
else
  echo "⚠️ gcloud not available — run manually:"
  echo "  gcloud sql backups create --instance=$INSTANCE --description='$DESCRIPTION'"
fi

echo "=== BACKUP COMPLETE ==="
