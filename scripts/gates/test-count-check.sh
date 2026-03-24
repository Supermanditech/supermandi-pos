#!/bin/bash
# GCP-STG-0714: CI regression detection — test count must not decrease
set -e
echo "=== TEST COUNT REGRESSION CHECK ==="

# Minimums (update as test count grows)
MIN_BACKEND=2900
MIN_SUPERADMIN=2300
MIN_RETAILER=1700

echo "[1/3] Backend tests..."
BACKEND_COUNT=$(cd backend && npx jest --forceExit --ci 2>&1 | grep -oP '\d+ passed' | head -1 | grep -oP '\d+')
echo "   Backend: $BACKEND_COUNT tests (min: $MIN_BACKEND)"
[ "${BACKEND_COUNT:-0}" -ge "$MIN_BACKEND" ] || { echo "FAIL: Backend test count dropped below $MIN_BACKEND"; exit 1; }

echo "[2/3] SuperAdmin tests..."
SA_COUNT=$(cd supermandi-superadmin && npx vitest run 2>&1 | grep -oP '\d+ passed' | head -1 | grep -oP '\d+')
echo "   SuperAdmin: $SA_COUNT tests (min: $MIN_SUPERADMIN)"
[ "${SA_COUNT:-0}" -ge "$MIN_SUPERADMIN" ] || { echo "FAIL: SuperAdmin test count dropped below $MIN_SUPERADMIN"; exit 1; }

echo "[3/3] Retailer tests..."
RET_COUNT=$(cd retailer-admin && npx vitest run 2>&1 | grep -oP '\d+ passed' | head -1 | grep -oP '\d+')
echo "   Retailer: $RET_COUNT tests (min: $MIN_RETAILER)"
[ "${RET_COUNT:-0}" -ge "$MIN_RETAILER" ] || { echo "FAIL: Retailer test count dropped below $MIN_RETAILER"; exit 1; }

echo "=== TEST COUNT CHECK: PASS ==="
