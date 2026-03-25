#!/bin/bash
# GCP-STG-0706: Retailer web env var gate — verify required vars before build
echo "=== RETAILER ENV VAR GATE ==="
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

# Firebase vars — required for phone auth
for var in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID; do
  if [ -z "${!var}" ]; then
    echo "WARNING: $var not set — Firebase phone auth will not work"
  else
    echo "OK $var is set"
  fi
done

# Optional but recommended
for var in VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID; do
  if [ -z "${!var}" ]; then
    echo "INFO: $var not set (optional)"
  else
    echo "OK $var is set"
  fi
done

[ "$FAIL" -eq 0 ] && echo "=== RETAILER ENV GATE: PASS ===" || { echo "=== FAIL ==="; exit 1; }
