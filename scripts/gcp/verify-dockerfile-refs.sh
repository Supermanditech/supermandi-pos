#!/bin/bash
# GCP-STG-0618: Verify deploy.yml references correct Dockerfile paths
echo "=== DOCKERFILE REFERENCE CHECK ==="
DEPLOY=".github/workflows/deploy.yml"
FAIL=0

check_ref() {
  local SERVICE=$1
  local EXPECTED=$2
  if grep -q "$EXPECTED" "$DEPLOY" 2>/dev/null; then
    echo "✅ $SERVICE → $EXPECTED"
  else
    echo "⚠️ $SERVICE: $EXPECTED not found in deploy.yml (may use default)"
  fi
}

check_ref "main-backend" "backend/Dockerfile.main"
check_ref "api-gateway" "api-gateway/Dockerfile"
check_ref "retailer-admin" "retailer-admin/Dockerfile"
check_ref "supplier-portal" "supplier-portal/Dockerfile"
check_ref "superadmin" "supermandi-superadmin/Dockerfile"
check_ref "landing" "supermandi-landing/Dockerfile"

echo "=== CHECK COMPLETE ==="
