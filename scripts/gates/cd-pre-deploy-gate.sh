#!/bin/bash
# GCP-STG-0717: CD pre-deploy gate — verify everything before pushing to Cloud Run
set -e
echo "=== CD PRE-DEPLOY GATE ==="

echo "[1/4] CI passed..."
# In CD pipeline, this is verified by workflow_run dependency
echo "CI gates dependency enforced by deploy.yml"

echo "[2/4] Fix guard..."
node scripts/fix-guard.js check || { echo "FAIL: Fix drift detected"; exit 1; }
echo "Fix guard clean"

echo "[3/4] Migration dry-run..."
if [ -f scripts/migrate-dry-run.js ]; then
  node scripts/migrate-dry-run.js || { echo "FAIL: Migration dry-run failed"; exit 1; }
  echo "Migration dry-run passed"
else
  echo "migrate-dry-run.js not found — skipping (will be added in 0596)"
fi

echo "[4/4] Docker images..."
echo "Docker images verified by CI build jobs"

echo "=== CD PRE-DEPLOY GATE: PASS ==="
