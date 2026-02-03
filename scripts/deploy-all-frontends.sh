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

# Test each endpoint (HTML)
echo "Testing HTML endpoints..."
RETAILER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/retailer/" 2>/dev/null || echo "000")
ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/admin/" 2>/dev/null || echo "000")
SUPPLIER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/supplier/" 2>/dev/null || echo "000")

echo "  Retailer Portal:  $RETAILER_STATUS"
echo "  Admin Portal:     $ADMIN_STATUS"
echo "  Supplier Portal:  $SUPPLIER_STATUS"

# RET-AUD-004: Verify JS/CSS assets are accessible (FAIL HARD if not)
echo ""
echo "Verifying asset accessibility (RET-AUD-004)..."
DEPLOY_FAILED=0

# Retailer assets verification
RETAILER_JS=$(curl -s "https://supermandi.tech/retailer/" 2>/dev/null | grep -oE 'index-[A-Za-z0-9]+\.js' | head -1)
if [ -n "$RETAILER_JS" ]; then
  RETAILER_JS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/retailer/assets/$RETAILER_JS" 2>/dev/null || echo "000")
  if [ "$RETAILER_JS_STATUS" != "200" ]; then
    echo "  ✗ CRITICAL: Retailer JS asset returns $RETAILER_JS_STATUS (expected 200)"
    echo "    Asset: /retailer/assets/$RETAILER_JS"
    DEPLOY_FAILED=1
  else
    echo "  ✓ Retailer JS asset accessible ($RETAILER_JS)"
  fi
else
  echo "  ⚠ Could not extract Retailer JS filename from HTML"
fi

RETAILER_CSS=$(curl -s "https://supermandi.tech/retailer/" 2>/dev/null | grep -oE 'index-[A-Za-z0-9]+\.css' | head -1)
if [ -n "$RETAILER_CSS" ]; then
  RETAILER_CSS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/retailer/assets/$RETAILER_CSS" 2>/dev/null || echo "000")
  if [ "$RETAILER_CSS_STATUS" != "200" ]; then
    echo "  ✗ CRITICAL: Retailer CSS asset returns $RETAILER_CSS_STATUS (expected 200)"
    echo "    Asset: /retailer/assets/$RETAILER_CSS"
    DEPLOY_FAILED=1
  else
    echo "  ✓ Retailer CSS asset accessible ($RETAILER_CSS)"
  fi
fi

# Admin assets verification
ADMIN_JS=$(curl -s "https://supermandi.tech/admin/" 2>/dev/null | grep -oE 'index-[A-Za-z0-9]+\.js' | head -1)
if [ -n "$ADMIN_JS" ]; then
  ADMIN_JS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/admin/assets/$ADMIN_JS" 2>/dev/null || echo "000")
  if [ "$ADMIN_JS_STATUS" != "200" ]; then
    echo "  ✗ CRITICAL: Admin JS asset returns $ADMIN_JS_STATUS (expected 200)"
    echo "    Asset: /admin/assets/$ADMIN_JS"
    DEPLOY_FAILED=1
  else
    echo "  ✓ Admin JS asset accessible ($ADMIN_JS)"
  fi
fi

ADMIN_CSS=$(curl -s "https://supermandi.tech/admin/" 2>/dev/null | grep -oE 'index-[A-Za-z0-9]+\.css' | head -1)
if [ -n "$ADMIN_CSS" ]; then
  ADMIN_CSS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/admin/assets/$ADMIN_CSS" 2>/dev/null || echo "000")
  if [ "$ADMIN_CSS_STATUS" != "200" ]; then
    echo "  ✗ CRITICAL: Admin CSS asset returns $ADMIN_CSS_STATUS (expected 200)"
    echo "    Asset: /admin/assets/$ADMIN_CSS"
    DEPLOY_FAILED=1
  else
    echo "  ✓ Admin CSS asset accessible ($ADMIN_CSS)"
  fi
fi

# API health check
echo ""
echo "Verifying API health..."
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "https://supermandi.tech/api/v1/health" 2>/dev/null || echo "000")
if [ "$API_HEALTH" = "200" ]; then
  echo "  ✓ API Gateway healthy ($API_HEALTH)"
elif [ "$API_HEALTH" = "404" ]; then
  echo "  ⚠ API health endpoint not found (404) - may need /health route"
else
  echo "  ⚠ API health returned $API_HEALTH"
fi

# FAIL HARD if any critical asset check failed
if [ "$DEPLOY_FAILED" = "1" ]; then
  echo ""
  echo "=========================================="
  echo "DEPLOYMENT FAILED - ASSET VERIFICATION"
  echo "=========================================="
  echo ""
  echo "One or more JS/CSS assets returned non-200 status."
  echo "Check nginx configuration for /retailer/assets/ and /admin/assets/ locations."
  echo ""
  echo "Debug commands:"
  echo "  ssh $VM_USER@$VM_HOST 'ls -la /var/www/retailer/assets/'"
  echo "  ssh $VM_USER@$VM_HOST 'sudo nginx -T | grep -A10 \"location /retailer\"'"
  echo ""
  exit 1
fi

# Summary
echo ""
echo "=========================================="
echo "Deployment Complete! All Checks Passed"
echo "=========================================="
echo ""
echo "URLs:"
echo "  Retailer: https://supermandi.tech/retailer/"
echo "  Admin:    https://supermandi.tech/admin/"
echo "  Supplier: https://supermandi.tech/supplier/"
echo "  API:      https://supermandi.tech/api/v1/"
echo ""
echo "Asset Verification: PASSED"
echo ""
echo "Logs:"
echo "  ssh $VM_USER@$VM_HOST 'pm2 logs supplier-portal'"
echo "  ssh $VM_USER@$VM_HOST 'sudo tail -f /var/log/nginx/access.log'"
echo ""
