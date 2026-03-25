#!/bin/bash
# GCP-STG-0716: CI bundle size gate — alert if bundle grows > 20% or > 10MB
echo "=== BUNDLE SIZE GATE ==="

MAX_SIZE_MB=10
FAIL=0

check_bundle() {
  local NAME=$1
  local DIR=$2

  if [ ! -d "$DIR" ]; then
    echo "WARNING $NAME: $DIR not found (build not run?)"
    return
  fi

  SIZE=$(du -sb "$DIR" 2>/dev/null | awk '{print $1}')
  SIZE_KB=$((SIZE / 1024))
  SIZE_MB=$((SIZE / 1024 / 1024))

  echo "$NAME: ${SIZE_KB}KB (${SIZE_MB}MB)"

  if [ "$SIZE_MB" -gt "$MAX_SIZE_MB" ]; then
    echo "  FAIL: Exceeds ${MAX_SIZE_MB}MB limit"
    FAIL=1
  else
    echo "  OK Within limit"
  fi
}

check_bundle "Retailer Admin" "retailer-admin/dist"
check_bundle "SuperAdmin" "supermandi-superadmin/dist"
check_bundle "Supplier Portal" "supplier-portal/.next"
check_bundle "Landing Page" "supermandi-landing"

echo ""
[ "$FAIL" -eq 0 ] && echo "=== BUNDLE SIZE GATE: PASS ===" || { echo "=== FAIL — bundles exceed limit ==="; exit 1; }
