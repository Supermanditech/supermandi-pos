#!/usr/bin/env bash
# GCP-STG-0624: Cloud SQL Backup Verification
# Verifies backup configuration for supermandi-staging Cloud SQL instance.
set -euo pipefail

PROJECT="supermandi-backend"
INSTANCE="supermandi-staging"

echo "=== Cloud SQL Backup Verification ==="
echo "Project:  $PROJECT"
echo "Instance: $INSTANCE"
echo ""

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
  echo "gcloud CLI not found. Run these commands manually:"
  echo ""
  echo "  # View backup configuration"
  echo "  gcloud sql instances describe $INSTANCE \\"
  echo "    --project=$PROJECT \\"
  echo "    --format='json(settings.backupConfiguration)'"
  echo ""
  echo "  # List recent backups"
  echo "  gcloud sql backups list --instance=$INSTANCE --project=$PROJECT"
  echo ""
  echo "  # View point-in-time recovery status"
  echo "  gcloud sql instances describe $INSTANCE \\"
  echo "    --project=$PROJECT \\"
  echo "    --format='json(settings.backupConfiguration.pointInTimeRecoveryEnabled)'"
  echo ""
  echo "See documentation below for expected configuration."
else
  echo "--- Backup Configuration ---"
  gcloud sql instances describe "$INSTANCE" \
    --project="$PROJECT" \
    --format='json(settings.backupConfiguration)' 2>&1 || echo "  (failed — check permissions)"

  echo ""
  echo "--- Recent Backups ---"
  gcloud sql backups list --instance="$INSTANCE" --project="$PROJECT" --limit=5 2>&1 || echo "  (failed — check permissions)"
fi

echo ""
cat <<'DOCS'
--- Expected Backup Configuration ---

1. AUTOMATED BACKUPS
   - Enabled: true
   - Start time: 02:00 (IST off-peak, ~20:30 UTC)
   - Location: asia-south1 (same region as instance)
   - Retention: 7 days (default) or 30 days (recommended for production)

2. POINT-IN-TIME RECOVERY (PITR)
   - Enabled: true (CRITICAL for production)
   - Allows recovery to any point within retention window
   - Uses binary logs (transaction logs) for granular recovery
   - Increases storage cost slightly

3. ON-DEMAND BACKUP (before migrations)
   gcloud sql backups create --instance=supermandi-staging \
     --project=supermandi-backend \
     --description="Pre-migration backup $(date +%Y-%m-%d)"

4. RESTORE FROM BACKUP
   # List available backups
   gcloud sql backups list --instance=supermandi-staging

   # Restore to a specific backup
   gcloud sql backups restore <BACKUP_ID> \
     --restore-instance=supermandi-staging

   # Point-in-time restore (to a new instance)
   gcloud sql instances clone supermandi-staging supermandi-staging-restore \
     --point-in-time="2026-03-25T10:00:00.000Z"

5. VERIFICATION CHECKLIST
   [ ] Automated backups enabled
   [ ] PITR enabled
   [ ] Backup retention >= 7 days
   [ ] Backup location matches instance region
   [ ] Test restore performed at least once
   [ ] Pre-migration backup script exists (scripts/gcp/backup-cloudsql.sh)
DOCS
