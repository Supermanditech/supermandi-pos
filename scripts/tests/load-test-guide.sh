#!/usr/bin/env bash
# GCP-STG-0642: Load Test Execution Guide
# Documents how to run the stress-test.yml workflow and interpret results.
set -euo pipefail

cat <<'DOCS'
=============================================================
  Load Test Execution Guide
=============================================================

1. TRIGGER THE STRESS TEST WORKFLOW

   # Via GitHub CLI
   gh workflow run stress-test.yml \
     -f base_url=https://staging.supermandi.tech \
     -f concurrent_users=50 \
     -f duration=300

   # Parameters:
   #   base_url         — Target environment URL
   #   concurrent_users — Number of simulated concurrent users (default: 50)
   #   duration         — Test duration in seconds (default: 300 = 5 min)

2. MONITOR TEST PROGRESS

   # List recent workflow runs
   gh run list --workflow=stress-test.yml --limit=5

   # Watch a specific run
   gh run watch <run-id>

   # View logs
   gh run view <run-id> --log

3. EXPECTED RESULTS TABLE

   Metric              | Target     | Warning    | Critical
   --------------------|------------|------------|----------
   P50 Latency         | < 200ms    | < 500ms    | > 500ms
   P95 Latency         | < 500ms    | < 1000ms   | > 1000ms
   P99 Latency         | < 1000ms   | < 2000ms   | > 2000ms
   Error Rate          | < 0.1%     | < 1%       | > 1%
   Throughput (RPS)    | > 100      | > 50       | < 50
   Memory Usage        | < 70%      | < 85%      | > 85%
   CPU Usage           | < 60%      | < 80%      | > 80%

4. PASS CRITERIA

   The load test PASSES if ALL of the following are met:
   [ ] P95 latency < 1000ms for all endpoints
   [ ] Error rate < 1% across all requests
   [ ] No 5xx errors on health check endpoints
   [ ] Memory stays under 85% throughout test
   [ ] No connection pool exhaustion errors
   [ ] No database deadlocks detected

5. KEY ENDPOINTS TESTED

   Endpoint                          | Method | Weight
   ----------------------------------|--------|--------
   /api/v1/health                    | GET    | 5%
   /api/v1/pos/catalog/search        | GET    | 25%
   /api/v1/pos/catalog/barcode/:code | GET    | 20%
   /api/v1/pos/sales                 | POST   | 15%
   /api/v1/pos/sales/:id/items       | POST   | 15%
   /api/v1/pos/sales/:id/complete    | POST   | 10%
   /api/v1/inventory/stock           | GET    | 10%

6. PRE-TEST CHECKLIST
   [ ] Target environment is running and healthy
   [ ] Database has seed data (at least 1000 SKUs)
   [ ] No other load tests running simultaneously
   [ ] Monitoring dashboards open (Cloud Run metrics, Cloud SQL)
   [ ] Alert thresholds noted (to distinguish test traffic from real)

7. POST-TEST ANALYSIS
   - Download the test report artifact from the workflow run
   - Compare against previous run (regression detection)
   - If P99 > 2s: check slow query log, check connection pool
   - If error rate > 1%: check application logs for root cause
   - Save results in RELEASES/BATCH_LEDGER.md under load test evidence
=============================================================
DOCS

echo "This is a documentation script — no changes made."
echo "Run the workflow with: gh workflow run stress-test.yml -f base_url=..."
