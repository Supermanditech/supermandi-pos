#!/bin/bash
# GCP-STG-0709: Supplier portal env var gate
echo "=== SUPPLIER ENV VAR GATE ==="
FAIL=0

# Required for build
for var in NEXT_PUBLIC_API_BASE_URL; do
  if [ -z "${!var}" ]; then
    echo "FAIL: $var is not set"
    FAIL=1
  else
    echo "OK $var is set"
  fi
done

# Firebase vars
for var in NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID; do
  if [ -z "${!var}" ]; then
    echo "WARNING: $var not set — Firebase phone auth will not work"
  else
    echo "OK $var is set"
  fi
done

[ "$FAIL" -eq 0 ] && echo "=== SUPPLIER ENV GATE: PASS ===" || { echo "=== FAIL ==="; exit 1; }
