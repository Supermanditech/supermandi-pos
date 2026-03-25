#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0679 — Memory Leak Detection for Cloud Run
# ────────────────────────────────────────────────────────────────
# Documents Cloud Run memory monitoring, growth detection, and
# alerting for sustained high memory utilization.
#
# Usage:  bash scripts/gcp/memory-leak-detection.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-supermandi-backend}"
REGION="${GCP_REGION:-asia-south1}"

cat << 'GUIDE'
================================================================
  MEMORY LEAK DETECTION — Cloud Run Services
================================================================

1. CLOUD RUN MEMORY LIMITS
---------------------------

  Check current memory configuration per service:

    gcloud run services describe <SERVICE> \
      --region=asia-south1 \
      --format="value(spec.template.spec.containers[0].resources.limits.memory)"

  Current limits:
    api-gateway:     512Mi
    backend-main:    1Gi
    retailer-admin:  256Mi
    supplier-portal: 256Mi
    superadmin:      256Mi
    landing:         128Mi

2. MEMORY UTILIZATION METRIC
-----------------------------

  Cloud Monitoring metric:
    run.googleapis.com/container/memory/utilizations

  This metric reports memory utilization as a fraction (0.0–1.0)
  of the configured memory limit.

  Query in MQL:
    fetch cloud_run_revision
    | metric 'run.googleapis.com/container/memory/utilizations'
    | filter resource.service_name == 'backend-main'
    | group_by 1m, [mean(value.utilizations)]
    | every 1m

  Query in PromQL (Cloud Monitoring):
    cloud_run_revision/container/memory/utilizations{
      service_name="backend-main"
    }

3. DETECTING MEMORY GROWTH
---------------------------

  Signs of a memory leak:
    a) Steadily increasing memory over hours/days
    b) Memory not returning to baseline after request spike
    c) OOM kills (container restarts with exit code 137)
    d) Increasing response latency correlated with memory growth

  Detection approach:
    1. Compare memory utilization at start of hour vs end of hour
    2. If growth > 5% per hour for 3+ consecutive hours → alert
    3. Track per-instance memory (not averaged across instances)

  Cloud Monitoring alert policy:
    Condition: Memory utilization > 80% for 5 minutes
    Across: ANY instance (not averaged)
    Notification: PagerDuty + Slack + Email

4. ALERT CONFIGURATION
-----------------------

  Create alert for sustained high memory:

    gcloud alpha monitoring policies create \
      --display-name="Cloud Run Memory Leak Detection" \
      --condition-display-name="Memory > 80% for 5 min" \
      --condition-filter='
        resource.type = "cloud_run_revision" AND
        metric.type = "run.googleapis.com/container/memory/utilizations"
      ' \
      --condition-threshold-value=0.8 \
      --condition-threshold-comparison=COMPARISON_GT \
      --condition-threshold-duration=300s \
      --condition-threshold-aggregations-alignment-period=60s \
      --condition-threshold-aggregations-per-series-aligner=ALIGN_MEAN \
      --notification-channels="${NOTIFICATION_CHANNEL_ID}"

  Create alert for OOM kills:

    gcloud alpha monitoring policies create \
      --display-name="Cloud Run OOM Kill Detection" \
      --condition-display-name="Container OOM Kill" \
      --condition-filter='
        resource.type = "cloud_run_revision" AND
        metric.type = "run.googleapis.com/container/instance/count" AND
        metric.labels.state = "active"
      ' \
      --documentation="Check Cloud Run logs for OOMKilled events"

5. INVESTIGATING MEMORY LEAKS
------------------------------

  Step 1: Identify which service is leaking
    gcloud logging read '
      resource.type="cloud_run_revision"
      textPayload:"OOMKilled"
    ' --limit=20 --format=json

  Step 2: Check instance memory over time
    gcloud logging read '
      resource.type="cloud_run_revision"
      resource.labels.service_name="backend-main"
    ' --limit=100 --format="table(timestamp,resource.labels.revision_name)"

  Step 3: Profile locally with Node.js heap snapshots
    # Add to service startup for debugging:
    # --inspect --max-old-space-size=512
    # Use Chrome DevTools → Memory → Heap Snapshot
    # Compare snapshots taken 5 minutes apart

  Step 4: Common Node.js memory leak patterns
    - Event listeners not removed (EventEmitter leak)
    - Growing arrays/maps used as caches without eviction
    - Closures holding references to large objects
    - Unhandled promise rejections accumulating
    - Database connection pool not bounded
    - Redis subscriber connections accumulating

6. REMEDIATION
--------------

  Immediate:
    - Set memory limit headroom: if service uses 400Mi normally,
      set limit to 512Mi (25% headroom)
    - Enable Cloud Run CPU throttling to slow leak growth
    - Set min-instances=0 so idle instances are reclaimed

  Long-term:
    - Add heap size monitoring to application health endpoint
    - Implement graceful shutdown after N requests (rotation)
    - Add memory usage to /health response:
      { "heap_used_mb": process.memoryUsage().heapUsed / 1048576 }
    - Set --max-old-space-size to 75% of container memory limit

7. MONITORING DASHBOARD
-----------------------

  Create Cloud Monitoring dashboard with:
    - Memory utilization per service (line chart, 24h)
    - Memory utilization per instance (heatmap)
    - OOM kill count (counter, 7d)
    - Request count overlaid with memory (correlation chart)
    - Container restart count (indicator)

  Dashboard JSON can be created via:
    gcloud monitoring dashboards create --config-from-file=dashboard.json

================================================================
  END OF MEMORY LEAK DETECTION GUIDE
================================================================
GUIDE
