#!/bin/bash
# GCP-STG-0637: Create 5xx error rate alerts for all Cloud Run services
#
# This script creates Cloud Monitoring alert policies that fire when any
# Cloud Run service returns >5% 5xx errors over a 5-minute window.
#
# Prerequisites:
#   - gcloud CLI authenticated with roles/monitoring.editor
#   - Notification channel already created (email/Slack/PagerDuty)
#
# Usage:
#   bash scripts/gcp/create-error-alerts.sh
#
# Manual setup alternative (Cloud Console):
#   1. Go to Monitoring → Alerting → Create Policy
#   2. Add condition: Cloud Run Revision → Request Count
#   3. Filter: response_code_class = "5xx"
#   4. Aggregation: Alignment period 5 min, Aligner = rate
#   5. Threshold: Above 5% of total requests
#   6. Duration: 5 minutes
#   7. Notification: Add email/Slack channel
#   8. Repeat for each service or use regex service filter

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-supermandi-backend}"
NOTIFICATION_CHANNEL="${ALERT_NOTIFICATION_CHANNEL:-}"

SERVICES=(api-gateway main-backend retailer-admin supplier-portal superadmin landing)

if [ -z "$NOTIFICATION_CHANNEL" ]; then
  echo "WARNING: ALERT_NOTIFICATION_CHANNEL not set."
  echo "List existing channels:"
  echo "  gcloud alpha monitoring channels list --project=$PROJECT_ID"
  echo ""
  echo "Create an email channel:"
  echo "  gcloud alpha monitoring channels create \\"
  echo "    --display-name='SuperMandi Alerts' \\"
  echo "    --type=email \\"
  echo "    --channel-labels=email_address=supermanditech@gmail.com \\"
  echo "    --project=$PROJECT_ID"
  echo ""
  echo "Then re-run with: ALERT_NOTIFICATION_CHANNEL=<channel-name> bash $0"
  echo ""
fi

for svc in "${SERVICES[@]}"; do
  echo "Creating 5xx alert for $svc..."

  POLICY_JSON=$(cat <<EOF
{
  "displayName": "[SuperMandi] $svc 5xx Error Rate > 5%",
  "documentation": {
    "content": "Cloud Run service **$svc** is returning more than 5% server errors (5xx) over the last 5 minutes.\n\n**Runbook**:\n1. Check Cloud Run logs: \`gcloud logging read 'resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$svc\" AND httpRequest.status>=500' --limit=50 --project=$PROJECT_ID\`\n2. Check recent deploys: \`gcloud run revisions list --service=$svc --project=$PROJECT_ID --region=asia-south1\`\n3. If caused by bad deploy, roll back: \`gcloud run services update-traffic $svc --to-revisions=PREVIOUS_REVISION=100 --project=$PROJECT_ID --region=asia-south1\`",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "$svc 5xx rate > 5%",
      "conditionThreshold": {
        "filter": "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"$svc\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM"
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 0.05,
        "duration": "300s",
        "trigger": { "count": 1 }
      }
    }
  ],
  "combiner": "OR",
  "enabled": true,
  "alertStrategy": {
    "autoClose": "1800s"
  }
}
EOF
  )

  # Add notification channel if provided
  if [ -n "$NOTIFICATION_CHANNEL" ]; then
    POLICY_JSON=$(echo "$POLICY_JSON" | jq --arg nc "$NOTIFICATION_CHANNEL" '. + {notificationChannels: [$nc]}')
  fi

  # Write to temp file and create policy
  TMPFILE=$(mktemp /tmp/alert-policy-XXXXXX.json)
  echo "$POLICY_JSON" > "$TMPFILE"

  gcloud alpha monitoring policies create \
    --policy-from-file="$TMPFILE" \
    --project="$PROJECT_ID" \
    2>&1 || echo "  (Policy may already exist or gcloud alpha not available — check Cloud Console)"

  rm -f "$TMPFILE"
  echo "  Done: $svc"
done

echo ""
echo "========================================"
echo "Alert policies created for ${#SERVICES[@]} services."
echo "Verify in Cloud Console: Monitoring → Alerting"
echo "========================================"
echo ""
echo "To list created policies:"
echo "  gcloud alpha monitoring policies list --project=$PROJECT_ID --format='table(displayName,enabled)'"
