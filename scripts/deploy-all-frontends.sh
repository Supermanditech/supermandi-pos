#!/bin/bash
# GL-DEPLOY-001: Deploy all frontend applications to Google VM
# Usage: ./deploy-all-frontends.sh [VM_HOST] [VM_USER]
#
# Prerequisites:
# - SSH key configured for VM access
# - npm install completed in all frontend directories
# - npm run build completed in all frontend directories

set -e

VM_HOST="${1:-34.14.220.171}"
VM_USER="${2:-supermanditech}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo "SuperMandi Frontend Deployment (GO-LIVE)"
echo "=========================================="
echo "VM: $VM_USER@$VM_HOST"
echo "Timestamp: $(date -Iseconds)"
echo ""

# Check SSH connectivity
echo "[1/7] Checking SSH connectivity..."
ssh -o ConnectTimeout=10 -o BatchMode=yes $VM_USER@$VM_HOST "echo 'SSH OK'" || {
  echo "ERROR: Cannot connect to VM. Check SSH key."
  echo "Run: ssh-keygen -t ed25519 && ssh-copy-id $VM_USER@$VM_HOST"
  exit 1
}

# Verify builds exist
echo "[2/7] Verifying local builds..."
if [ ! -f "$PROJECT_ROOT/retailer-admin/dist/index.html" ]; then
  echo "ERROR: retailer-admin not built. Run: cd retailer-admin && npm run build"
  exit 1
fi
if [ ! -f "$PROJECT_ROOT/supermandi-superadmin/dist/index.html" ]; then
  echo "ERROR: supermandi-superadmin not built. Run: cd supermandi-superadmin && npm run build"
  exit 1
fi
if [ ! -d "$PROJECT_ROOT/supplier-portal/.next" ]; then
  echo "ERROR: supplier-portal not built. Run: cd supplier-portal && npm run build"
  exit 1
fi
echo "  ✓ All builds verified"

# Create directories on VM
echo "[3/7] Creating directories on VM..."
ssh $VM_USER@$VM_HOST "sudo mkdir -p /var/www/retailer /var/www/admin /var/www/supplier && sudo chown -R $VM_USER:$VM_USER /var/www/"

# Deploy retailer-admin (Vite static)
echo "[4/7] Deploying retailer-admin to /var/www/retailer/..."
rsync -avz --delete --progress \
  "$PROJECT_ROOT/retailer-admin/dist/" \
  $VM_USER@$VM_HOST:/var/www/retailer/
echo "  ✓ retailer-admin deployed"

# Deploy supermandi-superadmin (Vite static)
echo "[5/7] Deploying admin-portal to /var/www/admin/..."
rsync -avz --delete --progress \
  "$PROJECT_ROOT/supermandi-superadmin/dist/" \
  $VM_USER@$VM_HOST:/var/www/admin/
echo "  ✓ admin-portal deployed"

# Deploy supplier-portal (Next.js server mode)
echo "[6/7] Deploying supplier-portal..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  "$PROJECT_ROOT/supplier-portal/" \
  $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/

ssh $VM_USER@$VM_HOST << 'EOF'
cd /home/supermanditech/supplier-portal

# Install dependencies if package.json changed
if [ ! -d "node_modules" ] || [ package.json -nt node_modules ]; then
  echo "Installing dependencies..."
  npm ci --production
fi

# Restart with PM2
pm2 delete supplier-portal 2>/dev/null || true
pm2 start npm --name "supplier-portal" -- start
pm2 save
EOF
echo "  ✓ supplier-portal deployed"

# Reload nginx
echo "[7/7] Reloading nginx..."
ssh $VM_USER@$VM_HOST "sudo nginx -t && sudo nginx -s reload"
echo "  ✓ nginx reloaded"

# Verify deployment
echo ""
echo "=========================================="
echo "Deployment Verification"
echo "=========================================="
echo ""

# Test each endpoint
echo "Testing endpoints..."
RETAILER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/retailer/" 2>/dev/null || echo "000")
ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/admin/" 2>/dev/null || echo "000")
SUPPLIER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/supplier/" 2>/dev/null || echo "000")

echo "  Retailer Portal:  $RETAILER_STATUS"
echo "  Admin Portal:     $ADMIN_STATUS"
echo "  Supplier Portal:  $SUPPLIER_STATUS"

# Summary
echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "URLs:"
echo "  Retailer: https://supermandi.tech/retailer/"
echo "  Admin:    https://supermandi.tech/admin/"
echo "  Supplier: https://supermandi.tech/supplier/"
echo "  API:      https://supermandi.tech/api/v1/"
echo ""
echo "Logs:"
echo "  ssh $VM_USER@$VM_HOST 'pm2 logs supplier-portal'"
echo "  ssh $VM_USER@$VM_HOST 'sudo tail -f /var/log/nginx/access.log'"
echo ""
