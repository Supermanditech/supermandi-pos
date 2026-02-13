#!/bin/bash
# =============================================================================
# SuperMandi Enroll Service v6 Deployment Script
# Deploys from repo source to VM - NOT hot-patching
#
# Usage: ./deploy-enroll-v6.sh
# =============================================================================

set -e

VM_HOST="34.14.220.171"
VM_USER="claude"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/supermandi_vm_key}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENROLL_SERVICE="$PROJECT_ROOT/scripts/enroll-service-v6.js"

echo "=========================================="
echo "SuperMandi Enroll Service v6 Deployment"
echo "=========================================="
echo "Source: $ENROLL_SERVICE"
echo "Target: $VM_USER@$VM_HOST"
echo ""

# Verify source file exists
if [ ! -f "$ENROLL_SERVICE" ]; then
  echo "ERROR: Source file not found: $ENROLL_SERVICE"
  exit 1
fi

# Verify version banner
VERSION=$(grep -o "SD-ONBOARD-[0-9A-Z]*" "$ENROLL_SERVICE" | head -1)
echo "Version: $VERSION"
echo ""

# Check SSH connectivity
echo "[1/5] Checking SSH connectivity..."
ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no $VM_USER@$VM_HOST "echo 'SSH OK'" || {
  echo "ERROR: Cannot connect to VM. Check SSH key: $SSH_KEY"
  exit 1
}

# Upload enroll service to /tmp
echo "[2/5] Uploading enroll service v6..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$ENROLL_SERVICE" $VM_USER@$VM_HOST:/tmp/enroll-service-v6.js

# Deploy using docker alpine (to handle bind mount permissions)
echo "[3/5] Deploying to /var/supermandi/scripts/..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $VM_USER@$VM_HOST << 'EOF'
# Create backup
BACKUP="/var/supermandi/scripts/enroll-service-v6.js.bak.$(date +%Y%m%d_%H%M%S)"
docker run --rm -v /var/supermandi/scripts:/scripts alpine sh -c "cp /scripts/enroll-service-v6.js /scripts/$(basename $BACKUP) 2>/dev/null" || true

# Deploy new version using alpine (handles permissions)
docker run --rm -v /var/supermandi/scripts:/scripts -v /tmp:/tmp alpine cp /tmp/enroll-service-v6.js /scripts/enroll-service-v6.js

echo "Deployed to /var/supermandi/scripts/enroll-service-v6.js"
EOF

# Restart service
echo "[4/5] Restarting enroll-service..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $VM_USER@$VM_HOST << 'EOF'
docker restart supermandi-enroll-service
sleep 3
EOF

# Verify deployment
echo "[5/5] Verifying deployment..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $VM_USER@$VM_HOST << 'EOF'
# Check version banner
VERSION=$(docker logs supermandi-enroll-service 2>&1 | grep "running on port" | tail -1)
echo "Running: $VERSION"

# Check container status
docker ps --format '{{.Names}} {{.Status}}' | grep enroll

# Quick health check
curl -s -X POST http://localhost:3009/scan/resolve \
  -H "Content-Type: application/json" \
  -H "X-Device-Token: invalid" \
  -d '{"barcode": "test"}' | head -c 100
echo ""
EOF

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Source: $ENROLL_SERVICE"
echo "Version: $VERSION"
echo "Target: /var/supermandi/scripts/enroll-service-v6.js"
echo ""
echo "To verify:"
echo "  ssh -i $SSH_KEY $VM_USER@$VM_HOST 'docker logs supermandi-enroll-service --tail 5'"
