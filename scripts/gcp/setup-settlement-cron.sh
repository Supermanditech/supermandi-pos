#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0660 — Daily Settlement Auto-Generation (Cloud Scheduler)
# ────────────────────────────────────────────────────────────────
# Documents Cloud Scheduler setup for daily settlement summary
# generation. Creates per-store settlement records from sales data.
#
# Usage:  bash scripts/gcp/setup-settlement-cron.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'DOCS'
================================================================
  DAILY SETTLEMENT CRON — Cloud Scheduler Setup
================================================================

OVERVIEW
--------
  Endpoint:  POST /api/v1/admin/settlements/generate-daily
  Schedule:  11:00 PM IST daily (17:30 UTC)
  Auth:      Service account with admin token
  Purpose:   Generate per-store settlement records from the day's
             sales data (cash, UPI, card, BNPL breakdowns)

What the job generates:
  - One settlement record per store per day
  - Aggregates: total sales, payment method breakdown, refunds
  - Cash expected = sum of cash sales - cash refunds
  - Digital expected = sum of UPI + card sales
  - Reconciliation flags for mismatches
  - Z-report data for end-of-day printing

================================================================
  1. CREATE CLOUD SCHEDULER JOB
================================================================

  # Staging environment
  gcloud scheduler jobs create http daily-settlement-staging \
    --project=supermandi-backend \
    --location=asia-south1 \
    --schedule="30 17 * * *" \
    --time-zone="UTC" \
    --description="Generate daily settlement summaries for all stores (11 PM IST)" \
    --uri="https://staging.supermandi.tech/api/v1/admin/settlements/generate-daily" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --oidc-service-account-email="scheduler-sa@supermandi-backend.iam.gserviceaccount.com" \
    --oidc-token-audience="https://staging.supermandi.tech" \
    --attempt-deadline="300s" \
    --max-retry-attempts=3 \
    --min-backoff="30s" \
    --max-backoff="300s"

  # Production environment
  gcloud scheduler jobs create http daily-settlement-prod \
    --project=supermandi-backend \
    --location=asia-south1 \
    --schedule="30 17 * * *" \
    --time-zone="UTC" \
    --description="Generate daily settlement summaries for all stores (11 PM IST)" \
    --uri="https://api.supermandi.tech/api/v1/admin/settlements/generate-daily" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --oidc-service-account-email="scheduler-sa@supermandi-backend.iam.gserviceaccount.com" \
    --oidc-token-audience="https://api.supermandi.tech" \
    --attempt-deadline="300s" \
    --max-retry-attempts=3 \
    --min-backoff="30s" \
    --max-backoff="300s"

================================================================
  2. SERVICE ACCOUNT SETUP
================================================================

  # Create dedicated service account for scheduler
  gcloud iam service-accounts create scheduler-sa \
    --project=supermandi-backend \
    --display-name="Cloud Scheduler Service Account"

  # Grant Cloud Run invoker role
  gcloud run services add-iam-policy-binding backend-main \
    --project=supermandi-backend \
    --region=asia-south1 \
    --member="serviceAccount:scheduler-sa@supermandi-backend.iam.gserviceaccount.com" \
    --role="roles/run.invoker"

  # Grant scheduler job runner role
  gcloud projects add-iam-policy-binding supermandi-backend \
    --member="serviceAccount:scheduler-sa@supermandi-backend.iam.gserviceaccount.com" \
    --role="roles/cloudscheduler.jobRunner"

================================================================
  3. ENDPOINT SPECIFICATION
================================================================

  POST /api/v1/admin/settlements/generate-daily

  Request body (optional — defaults to yesterday):
  {
    "date": "2026-03-25",     // ISO date, defaults to yesterday
    "storeId": null           // null = all stores, or specific store
  }

  Response (200 OK):
  {
    "success": true,
    "settlements": [
      {
        "storeId": "SU260305-003",
        "date": "2026-03-25",
        "totalSales": 45230.50,
        "totalRefunds": 1200.00,
        "netSales": 44030.50,
        "paymentBreakdown": {
          "cash": 22000.00,
          "upi": 15030.50,
          "card": 7000.00,
          "bnpl": 0.00
        },
        "transactionCount": 87,
        "refundCount": 3,
        "cashExpected": 22000.00,
        "digitalExpected": 22030.50,
        "status": "GENERATED",
        "generatedAt": "2026-03-25T17:30:00Z"
      }
    ],
    "storesProcessed": 5,
    "errors": []
  }

  Error cases:
  - 401: Missing or invalid auth token
  - 403: Not admin role
  - 409: Settlement already generated for this date
  - 500: Database error during aggregation

================================================================
  4. AUTH REQUIREMENTS
================================================================

  The endpoint accepts two auth methods:

  Method A: OIDC Token (Cloud Scheduler)
    - Cloud Scheduler sends OIDC token automatically
    - API Gateway validates against Google's public keys
    - Maps to admin role internally

  Method B: Admin JWT (Manual trigger)
    - Standard admin JWT from auth-service
    - For manual re-runs or debugging
    - Example:
      curl -X POST \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"date": "2026-03-25"}' \
        https://staging.supermandi.tech/api/v1/admin/settlements/generate-daily

================================================================
  5. MONITORING & ALERTS
================================================================

  # View job execution history
  gcloud scheduler jobs describe daily-settlement-staging \
    --project=supermandi-backend \
    --location=asia-south1

  # List recent executions
  gcloud logging read "resource.type=cloud_scheduler_job AND \
    resource.labels.job_id=daily-settlement-staging" \
    --project=supermandi-backend \
    --limit=10

  # Create alert for job failures
  gcloud alpha monitoring policies create \
    --project=supermandi-backend \
    --display-name="Settlement Cron Failure" \
    --condition-display-name="Settlement job failed" \
    --condition-filter='resource.type="cloud_scheduler_job" AND
      metric.type="cloudscheduler.googleapis.com/job/attempt_count" AND
      metric.labels.status!="200"' \
    --notification-channels="<channel-id>"

================================================================
  6. MANUAL OPERATIONS
================================================================

  # Trigger job manually (for testing or re-runs)
  gcloud scheduler jobs run daily-settlement-staging \
    --project=supermandi-backend \
    --location=asia-south1

  # Pause job (e.g., during maintenance)
  gcloud scheduler jobs pause daily-settlement-staging \
    --project=supermandi-backend \
    --location=asia-south1

  # Resume job
  gcloud scheduler jobs resume daily-settlement-staging \
    --project=supermandi-backend \
    --location=asia-south1

  # Delete job
  gcloud scheduler jobs delete daily-settlement-staging \
    --project=supermandi-backend \
    --location=asia-south1

  # Re-generate settlement for a specific past date
  curl -X POST \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"date": "2026-03-20", "force": true}' \
    https://staging.supermandi.tech/api/v1/admin/settlements/generate-daily

================================================================
  7. SCHEDULE NOTES
================================================================

  Schedule: "30 17 * * *" (UTC) = 11:00 PM IST

  Why 11 PM IST:
    - After typical store closing time (9-10 PM)
    - Before midnight (avoids date boundary issues)
    - Allows time for late POS syncs to complete
    - Settlement covers 12:00 AM to 11:59 PM of that day

  IST offset: UTC+5:30
    - 11:00 PM IST = 5:30 PM UTC = 17:30 UTC
    - Cron: "30 17 * * *" in UTC timezone

  DST note: India does not observe DST, so the schedule is stable
  year-round. No seasonal adjustments needed.

================================================================
  END OF SETTLEMENT CRON DOCUMENTATION
================================================================
DOCS
