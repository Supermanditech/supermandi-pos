#!/bin/bash
# GCP-STG-0599: Verify deployed SHA matches expected
EXPECTED_SHA="${1:-$(git rev-parse --short HEAD)}"
BASE_URL="${2:-https://staging.supermandi.tech}"

echo "=== DEPLOY SHA VERIFICATION ==="
echo "Expected: $EXPECTED_SHA"

DEPLOYED_SHA=$(curl -s --max-time 10 "${BASE_URL}/api/v1/admin/health" | grep -oP '"gitSha"\s*:\s*"([^"]*)"' | grep -oP '"[^"]*"$' | tr -d '"' || echo "UNKNOWN")

echo "Deployed: $DEPLOYED_SHA"

if [ "$DEPLOYED_SHA" = "$EXPECTED_SHA" ] || [ "${DEPLOYED_SHA:0:7}" = "${EXPECTED_SHA:0:7}" ]; then
  echo "=== SHA VERIFICATION: ✅ MATCH ==="
else
  echo "=== SHA VERIFICATION: ❌ MISMATCH ==="
  echo "Expected $EXPECTED_SHA but got $DEPLOYED_SHA"
  exit 1
fi
