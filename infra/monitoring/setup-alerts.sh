#!/bin/bash
# T-223: Setup Cloud Monitoring alerts for SuperMandi
# Run this once after GCP infrastructure is ready.
#
# Prerequisites:
# - gcloud CLI authenticated with supermandi-backend project
# - Cloud Monitoring API enabled
# - Notification channel created (email/Slack)

set -euo pipefail

PROJECT="supermandi-backend"
REGION="asia-south1"

echo "=== T-223: Setting up Cloud Monitoring alerts ==="
echo "Project: $PROJECT"
echo ""

# Step 1: Create notification channel (email)
echo "Step 1: Creating email notification channel..."
CHANNEL_ID=$(gcloud alpha monitoring channels create \
  --project="$PROJECT" \
  --display-name="SuperMandi Ops Email" \
  --type=email \
  --channel-labels=email_address=ops@supermandi.tech \
  --format="value(name)" 2>/dev/null || echo "")

if [ -z "$CHANNEL_ID" ]; then
  echo "  -> Notification channel may already exist. Listing existing..."
  CHANNEL_ID=$(gcloud alpha monitoring channels list \
    --project="$PROJECT" \
    --filter="displayName='SuperMandi Ops Email'" \
    --format="value(name)" 2>/dev/null | head -1)
fi

echo "  Notification Channel: $CHANNEL_ID"
echo ""

# Step 2: Create uptime checks for all portals
echo "Step 2: Creating uptime checks..."
for path in "/" "/retailer/" "/supplier/" "/admin/" "/api/v1/pos/health"; do
  name="supermandi-uptime-${path//\//-}"
  name="${name//-$//}"  # Remove trailing dash
  echo "  Creating uptime check for: https://staging.supermandi.tech$path"
  gcloud alpha monitoring uptime create "$name" \
    --project="$PROJECT" \
    --display-name="SuperMandi $path" \
    --resource-type=uptime-url \
    --hostname="staging.supermandi.tech" \
    --path="$path" \
    --protocol=https \
    --period=300 \
    --timeout=10s \
    --regions=asia-pacific,us-central 2>/dev/null || echo "  (may already exist)"
done
echo ""

# Step 3: Create alert policies
# Note: gcloud alpha monitoring policies create requires JSON format
# The YAML file is for documentation — convert to JSON for API
echo "Step 3: Alert policies defined in alert-policies.yaml"
echo "  To apply manually:"
echo "  1. Go to https://console.cloud.google.com/monitoring/alerting?project=$PROJECT"
echo "  2. Create policies matching alert-policies.yaml definitions"
echo "  3. Attach notification channel: $CHANNEL_ID"
echo ""
echo "  Alternatively, use Terraform or the Monitoring API directly."
echo ""

# Step 4: Create a monitoring dashboard
echo "Step 4: Creating monitoring dashboard..."
cat <<'DASHBOARD_EOF' > /tmp/supermandi-dashboard.json
{
  "displayName": "SuperMandi Operations",
  "gridLayout": {
    "columns": "2",
    "widgets": [
      {
        "title": "Cloud Run Request Count",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_RATE",
                  "crossSeriesReducer": "REDUCE_SUM",
                  "groupByFields": ["resource.label.service_name"]
                }
              }
            }
          }]
        }
      },
      {
        "title": "Cloud Run Latency (p95)",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_PERCENTILE_95",
                  "crossSeriesReducer": "REDUCE_MAX",
                  "groupByFields": ["resource.label.service_name"]
                }
              }
            }
          }]
        }
      },
      {
        "title": "Cloud SQL CPU",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_MEAN"
                }
              }
            }
          }]
        }
      },
      {
        "title": "Cloud SQL Connections",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/network/connections\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_MEAN"
                }
              }
            }
          }]
        }
      }
    ]
  }
}
DASHBOARD_EOF

gcloud monitoring dashboards create \
  --project="$PROJECT" \
  --config-from-file=/tmp/supermandi-dashboard.json 2>/dev/null || echo "  Dashboard may already exist"

echo ""
echo "=== Setup complete ==="
echo "Monitor at: https://console.cloud.google.com/monitoring?project=$PROJECT"
