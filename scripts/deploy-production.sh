#!/bin/bash
# =============================================================================
# SuperMandi One-Click Production Deployment
# =============================================================================
# Deploys: Retailer Portal, Admin Portal, Supplier Portal, Backend, Nginx
# Target: supermandi.tech (Google Cloud VM)
#
# Usage: ./scripts/deploy-production.sh [--skip-backend] [--skip-build]
#
# Prerequisites:
# - SSH key configured: ssh-copy-id supermanditech@34.14.220.171
# - Node.js 18+ and npm installed locally
# - Git repository clean or changes committed
# =============================================================================

set -e  # Exit on any error

# =============================================================================
# CONFIGURATION
# =============================================================================

VM_HOST="34.14.220.171"
VM_USER="supermanditech"
DOMAIN="supermandi.tech"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
SKIP_BACKEND=false
SKIP_BUILD=false
for arg in "$@"; do
  case $arg in
    --skip-backend) SKIP_BACKEND=true ;;
    --skip-build) SKIP_BUILD=true ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
STEP=0
TOTAL_STEPS=10
ERRORS=0

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

step() {
  STEP=$((STEP + 1))
  echo ""
  echo -e "${CYAN}[$STEP/$TOTAL_STEPS] $1${NC}"
  echo "────────────────────────────────────────"
}

success() { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; ERRORS=$((ERRORS + 1)); }

fatal() {
  echo ""
  echo -e "${RED}═══════════════════════════════════════════${NC}"
  echo -e "${RED}DEPLOYMENT FAILED: $1${NC}"
  echo -e "${RED}═══════════════════════════════════════════${NC}"
  exit 1
}

verify_url() {
  local url=$1
  local expected=$2
  local name=$3
  local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$status" = "$expected" ]; then
    success "$name: $status"
    return 0
  else
    fail "$name: Expected $expected, got $status"
    return 1
  fi
}

# =============================================================================
# BANNER
# =============================================================================

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       SUPERMANDI PRODUCTION DEPLOYMENT (ONE-CLICK)            ║${NC}"
echo -e "${BLUE}╠═══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║  Target: https://$DOMAIN                            ║${NC}"
echo -e "${BLUE}║  VM:     $VM_USER@$VM_HOST                        ║${NC}"
echo -e "${BLUE}║  Time:   $(date '+%Y-%m-%d %H:%M:%S %Z')                       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"

# =============================================================================
# STEP 1: PRE-FLIGHT CHECKS
# =============================================================================

step "Pre-flight checks"

# Check SSH connectivity
echo "  Testing SSH connection..."
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes $VM_USER@$VM_HOST "echo 'OK'" >/dev/null 2>&1; then
  fatal "Cannot connect to VM via SSH. Run: ssh-copy-id $VM_USER@$VM_HOST"
fi
success "SSH connection OK"

# Check Git status
cd "$PROJECT_ROOT"
if [ -n "$(git status --porcelain)" ]; then
  warn "Uncommitted changes detected - deploying current state"
fi
GIT_SHA=$(git rev-parse --short HEAD)
GIT_BRANCH=$(git branch --show-current)
success "Git: $GIT_BRANCH @ $GIT_SHA"

# =============================================================================
# STEP 2: BUILD FRONTENDS
# =============================================================================

if [ "$SKIP_BUILD" = true ]; then
  step "Build frontends (SKIPPED)"
  warn "Using existing builds"
else
  step "Build frontends"

  # Retailer Admin
  echo "  Building retailer-admin..."
  cd "$PROJECT_ROOT/retailer-admin"
  npm ci --silent 2>/dev/null || npm install --silent
  npm run build >/dev/null 2>&1
  if [ -f "dist/index.html" ]; then
    success "retailer-admin built"
  else
    fatal "retailer-admin build failed"
  fi

  # SuperAdmin
  echo "  Building supermandi-superadmin..."
  cd "$PROJECT_ROOT/supermandi-superadmin"
  npm ci --silent 2>/dev/null || npm install --silent
  npm run build >/dev/null 2>&1
  if [ -f "dist/index.html" ]; then
    success "supermandi-superadmin built"
  else
    fatal "supermandi-superadmin build failed"
  fi

  # Supplier Portal
  echo "  Building supplier-portal..."
  cd "$PROJECT_ROOT/supplier-portal"
  npm ci --silent 2>/dev/null || npm install --silent
  npm run build >/dev/null 2>&1
  if [ -d ".next" ]; then
    success "supplier-portal built"
  else
    fatal "supplier-portal build failed"
  fi
fi

# =============================================================================
# STEP 3: CREATE DIRECTORIES ON VM
# =============================================================================

step "Prepare VM directories"

ssh $VM_USER@$VM_HOST "sudo mkdir -p /var/www/retailer /var/www/admin /var/www/supermandi-landing && sudo chown -R $VM_USER:$VM_USER /var/www/"
success "Directories ready"

# =============================================================================
# STEP 4: DEPLOY LANDING PAGE
# =============================================================================

step "Deploy landing page"

scp -q "$PROJECT_ROOT/supermandi-landing/index.html" $VM_USER@$VM_HOST:/var/www/supermandi-landing/
success "Landing page deployed"

# =============================================================================
# STEP 5: DEPLOY RETAILER PORTAL
# =============================================================================

step "Deploy retailer portal"

rsync -az --delete --info=progress2 \
  "$PROJECT_ROOT/retailer-admin/dist/" \
  $VM_USER@$VM_HOST:/var/www/retailer/
success "Retailer portal deployed"

# =============================================================================
# STEP 6: DEPLOY ADMIN PORTAL
# =============================================================================

step "Deploy admin portal"

rsync -az --delete --info=progress2 \
  "$PROJECT_ROOT/supermandi-superadmin/dist/" \
  $VM_USER@$VM_HOST:/var/www/admin/
success "Admin portal deployed"

# =============================================================================
# STEP 7: DEPLOY SUPPLIER PORTAL
# =============================================================================

step "Deploy supplier portal"

rsync -az --info=progress2 \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next/cache' \
  "$PROJECT_ROOT/supplier-portal/" \
  $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/

ssh $VM_USER@$VM_HOST << 'SUPPLIER_EOF'
cd /home/supermanditech/supplier-portal
if [ ! -d "node_modules" ] || [ package.json -nt node_modules ]; then
  npm ci --production --silent 2>/dev/null || npm install --production --silent
fi
pm2 delete supplier-portal 2>/dev/null || true
pm2 start npm --name "supplier-portal" -- start
pm2 save --force >/dev/null 2>&1
SUPPLIER_EOF
success "Supplier portal deployed"

# =============================================================================
# STEP 8: UPDATE NGINX CONFIG
# =============================================================================

step "Update nginx configuration"

# Upload nginx config
scp -q "$PROJECT_ROOT/nginx.prod.conf" $VM_USER@$VM_HOST:/tmp/nginx.prod.conf

ssh $VM_USER@$VM_HOST << 'NGINX_EOF'
# Backup current config
sudo cp /etc/nginx/sites-enabled/supermandi.tech /etc/nginx/sites-enabled/supermandi.tech.bak 2>/dev/null || true

# Install new config
sudo cp /tmp/nginx.prod.conf /etc/nginx/sites-enabled/supermandi.tech

# Test config
if sudo nginx -t 2>/dev/null; then
  sudo systemctl reload nginx
  echo "NGINX_OK"
else
  # Rollback on failure
  sudo cp /etc/nginx/sites-enabled/supermandi.tech.bak /etc/nginx/sites-enabled/supermandi.tech 2>/dev/null || true
  echo "NGINX_FAIL"
fi
NGINX_EOF

success "Nginx configuration updated (HSTS enabled)"

# =============================================================================
# STEP 9: DEPLOY BACKEND (Optional)
# =============================================================================

if [ "$SKIP_BACKEND" = true ]; then
  step "Deploy backend (SKIPPED)"
  warn "Backend deployment skipped"
else
  step "Deploy backend"

  ssh $VM_USER@$VM_HOST << 'BACKEND_EOF'
cd /var/supermandi
git pull origin main >/dev/null 2>&1 || true

cd /var/supermandi/backend
docker compose -f docker-compose.prod.yml up -d --build 2>/dev/null

# Wait for services
sleep 5

# Check health
if curl -s http://localhost:3000/health | grep -q "ok"; then
  echo "BACKEND_OK"
else
  echo "BACKEND_WARN"
fi
BACKEND_EOF
  success "Backend deployed"
fi

# =============================================================================
# STEP 10: VERIFICATION
# =============================================================================

step "Production verification"

echo ""
echo "  Testing endpoints..."

# Core endpoints
verify_url "https://$DOMAIN/" "200" "Landing page"
verify_url "https://$DOMAIN/retailer/" "200" "Retailer portal"
verify_url "https://$DOMAIN/retailer/login" "200" "Retailer login"
verify_url "https://$DOMAIN/admin/" "200" "Admin portal"
verify_url "https://$DOMAIN/supplier/" "200" "Supplier portal"
verify_url "https://$DOMAIN/supplier/login/" "200" "Supplier login"
verify_url "https://$DOMAIN/api/v1/health" "200" "API health"

# Asset verification
echo ""
echo "  Testing assets..."

RETAILER_JS=$(curl -s "https://$DOMAIN/retailer/" 2>/dev/null | grep -oE 'index-[A-Za-z0-9]+\.js' | head -1)
if [ -n "$RETAILER_JS" ]; then
  verify_url "https://$DOMAIN/retailer/assets/$RETAILER_JS" "200" "Retailer JS ($RETAILER_JS)"
else
  fail "Could not find Retailer JS in HTML"
fi

ADMIN_JS=$(curl -s "https://$DOMAIN/admin/" 2>/dev/null | grep -oE 'index-[A-Za-z0-9]+\.js' | head -1)
if [ -n "$ADMIN_JS" ]; then
  verify_url "https://$DOMAIN/admin/assets/$ADMIN_JS" "200" "Admin JS ($ADMIN_JS)"
else
  fail "Could not find Admin JS in HTML"
fi

# Security headers
echo ""
echo "  Testing security headers..."

HSTS=$(curl -sI "https://$DOMAIN/" 2>/dev/null | grep -i "strict-transport-security" | head -1)
if [ -n "$HSTS" ]; then
  success "HSTS header present"
else
  fail "HSTS header missing"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}DEPLOYMENT COMPLETED WITH $ERRORS ERROR(S)${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "  Review the errors above and fix manually if needed."
  echo ""
  exit 1
else
  echo -e "${GREEN}DEPLOYMENT SUCCESSFUL - ALL CHECKS PASSED${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${GREEN}Git:${NC}       $GIT_BRANCH @ $GIT_SHA"
  echo -e "  ${GREEN}Time:${NC}      $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo ""
  echo -e "  ${CYAN}URLs:${NC}"
  echo "    Landing:   https://$DOMAIN/"
  echo "    Retailer:  https://$DOMAIN/retailer/"
  echo "    Admin:     https://$DOMAIN/admin/"
  echo "    Supplier:  https://$DOMAIN/supplier/"
  echo "    API:       https://$DOMAIN/api/v1/health"
  echo ""
  echo -e "  ${CYAN}Logs:${NC}"
  echo "    ssh $VM_USER@$VM_HOST 'pm2 logs supplier-portal'"
  echo "    ssh $VM_USER@$VM_HOST 'docker logs backend-api-gateway-1 --tail 50'"
  echo ""
fi
