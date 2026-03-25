#!/bin/bash
# GCP-STG-0712: SuperAdmin env var gate
echo "=== SUPERADMIN ENV VAR GATE ==="
FAIL=0

# Required for build
for var in VITE_API_BASE_URL; do
  if [ -z "${!var}" ]; then
    echo "FAIL: $var is not set"
    FAIL=1
  else
    echo "OK $var is set"
  fi
done

# Admin-specific config (runtime, not build-time — but document)
echo ""
echo "Runtime env vars (set on Cloud Run, not needed at build time):"
echo "  ADMIN_EMAIL_ALLOWLIST — comma-separated admin emails"
echo "  JWT_SECRET — for admin token signing"
echo "  JWT_SECRET_PREVIOUS — for rotation (GCP-STG-0480)"

[ "$FAIL" -eq 0 ] && echo "=== SUPERADMIN ENV GATE: PASS ===" || { echo "=== FAIL ==="; exit 1; }
