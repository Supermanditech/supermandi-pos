#!/bin/bash
# GCP-STG-0638: Cloud SQL alerting — CPU > 80%, connections > 80%, disk > 80%
# Run this script to display alert setup instructions for Cloud Console.
# These alerts ensure early warning before Cloud SQL becomes unresponsive.

set -euo pipefail

echo "=== CLOUD SQL ALERT SETUP ==="
echo "Create these alerts in Cloud Console -> Monitoring -> Alerting:"
echo ""
echo "Alert 1: Cloud SQL CPU > 80%"
echo "  Metric: cloudsql.googleapis.com/database/cpu/utilization"
echo "  Threshold: > 0.8 for 5 minutes"
echo "  Notification: email + Slack"
echo ""
echo "Alert 2: Cloud SQL Connections > 80%"
echo "  Metric: cloudsql.googleapis.com/database/postgresql/num_backends"
echo "  Threshold: > 80 (if max_connections=100)"
echo "  Notification: email + Slack"
echo ""
echo "Alert 3: Cloud SQL Disk > 80%"
echo "  Metric: cloudsql.googleapis.com/database/disk/utilization"
echo "  Threshold: > 0.8 for 10 minutes"
echo "  Notification: email + Slack"
echo ""
echo "To create programmatically:"
echo "  gcloud alpha monitoring policies create --policy-from-file=alert-policy.json"
echo "=== SETUP COMPLETE ==="
