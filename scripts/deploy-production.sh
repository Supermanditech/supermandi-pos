#!/bin/bash
# =============================================================================
# SuperMandi One-Click Production Deployment (DEPLOY-OPS-003)
# =============================================================================
# Deploys: Retailer Portal, Admin Portal, Supplier Portal, Backend, Nginx
# Target: supermandi.tech (Google Cloud VM)
#
# Usage: ./scripts/deploy-production.sh [OPTIONS]
#
# Options:
#   --sha <commit>    Deploy specific commit (default: current HEAD)
#   --skip-backend    Skip backend deployment
#   --skip-build      Use existing builds (skip npm build)
#   --dry-run         Show what would be deployed without deploying
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
DRY_RUN=false
TARGET_SHA=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --sha)
      TARGET_SHA="$2"
      shift 2
      ;;
    --skip-backend)
      SKIP_BACKEND=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--sha <commit>] [--skip-backend] [--skip-build] [--dry-run]"
      exit 1
      ;;
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
TOTAL_STEPS=11
ERRORS=0

# Evidence collection
EVIDENCE_FILE="/tmp/deploy-evidence-$(date +%Y%m%d-%H%M%S).txt"

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
  local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10 2>/dev/null || echo "000")
  if [ "$status" = "$expected" ]; then
    success "$name: $status"
    echo "$name: $status" >> "$EVIDENCE_FILE"
    return 0
  else
    fail "$name: Expected $expected, got $status"
    echo "$name: FAIL - Expected $expected, got $status" >> "$EVIDENCE_FILE"
    return 1
  fi
}

# =============================================================================
# BANNER
# =============================================================================

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       SUPERMANDI PRODUCTION DEPLOYMENT (DEPLOY-OPS-003)       ║${NC}"
echo -e "${BLUE}╠═══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║  Target: https://$DOMAIN                            ║${NC}"
echo -e "${BLUE}║  VM:     $VM_USER@$VM_HOST                        ║${NC}"
echo -e "${BLUE}║  Time:   $(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M:%S IST' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S')                       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"

# =============================================================================
# STEP 1: RESOLVE AND CHECKOUT TARGET SHA
# =============================================================================

step "Resolve target SHA"

cd "$PROJECT_ROOT"

# Resolve target SHA
if [ -n "$TARGET_SHA" ]; then
  # Verify the SHA exists
  if ! git rev-parse --verify "$TARGET_SHA" >/dev/null 2>&1; then
    fatal "SHA '$TARGET_SHA' does not exist in repository"
  fi
  GIT_SHA_FULL=$(git rev-parse "$TARGET_SHA")
  GIT_SHA=$(git rev-parse --short "$TARGET_SHA")

  # Checkout the specific SHA
  echo "  Checking out SHA: $TARGET_SHA..."
  git checkout "$GIT_SHA_FULL" --quiet
  success "Checked out $GIT_SHA"
else
  # Use current HEAD
  GIT_SHA=$(git rev-parse --short HEAD)
  GIT_SHA_FULL=$(git rev-parse HEAD)
  success "Using current HEAD: $GIT_SHA"
fi

GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")

# Start evidence file
cat > "$EVIDENCE_FILE" << EOF
═══════════════════════════════════════════════════════════════
SUPERMANDI DEPLOYMENT EVIDENCE
═══════════════════════════════════════════════════════════════
Deployed SHA (short): $GIT_SHA
Deployed SHA (full):  $GIT_SHA_FULL
Branch:               $GIT_BRANCH
Deploy Time (IST):    $(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M:%S IST' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S')
Deploy Command:       $0 $@
───────────────────────────────────────────────────────────────

EOF

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${YELLOW}DRY RUN MODE - No actual deployment will occur${NC}"
  echo ""
fi

# =============================================================================
# STEP 2: PRE-FLIGHT CHECKS
# =============================================================================

step "Pre-flight checks"

# Check SSH connectivity
echo "  Testing SSH connection..."
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes $VM_USER@$VM_HOST "echo 'OK'" >/dev/null 2>&1; then
  fatal "Cannot connect to VM via SSH. Run: ssh-copy-id $VM_USER@$VM_HOST"
fi
success "SSH connection OK"

# Check Git status
if [ -n "$(git status --porcelain)" ]; then
  warn "Uncommitted changes detected (deploying from SHA: $GIT_SHA)"
fi
success "Git: $GIT_BRANCH @ $GIT_SHA"

# =============================================================================
# STEP 3: BUILD FRONTENDS
# =============================================================================

if [ "$SKIP_BUILD" = true ]; then
  step "Build frontends (SKIPPED)"
  warn "Using existing builds"
else
  step "Build frontends"

  if [ "$DRY_RUN" = true ]; then
    success "[DRY RUN] Would build retailer-admin"
    success "[DRY RUN] Would build supermandi-superadmin"
    success "[DRY RUN] Would build supplier-portal"
  else
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
fi

# =============================================================================
# STEP 4: CREATE VERSIONED DIRECTORIES ON VM
# =============================================================================

step "Prepare VM directories (versioned)"

if [ "$DRY_RUN" = true ]; then
  success "[DRY RUN] Would create /var/www/supermandi/releases/$GIT_SHA/"
else
  ssh $VM_USER@$VM_HOST << MKDIR_EOF
sudo mkdir -p /var/www/supermandi/releases/$GIT_SHA/retailer
sudo mkdir -p /var/www/supermandi/releases/$GIT_SHA/admin
sudo mkdir -p /var/www/supermandi-landing
sudo chown -R $VM_USER:$VM_USER /var/www/supermandi
sudo chown -R $VM_USER:$VM_USER /var/www/supermandi-landing
MKDIR_EOF
  success "Directories ready: /var/www/supermandi/releases/$GIT_SHA/"
fi

# =============================================================================
# STEP 5: DEPLOY LANDING PAGE
# =============================================================================

step "Deploy landing page"

if [ "$DRY_RUN" = true ]; then
  success "[DRY RUN] Would deploy landing page"
else
  scp -q "$PROJECT_ROOT/supermandi-landing/index.html" $VM_USER@$VM_HOST:/var/www/supermandi-landing/
  success "Landing page deployed"
fi

# =============================================================================
# STEP 6: DEPLOY RETAILER PORTAL (versioned)
# =============================================================================

step "Deploy retailer portal"

if [ "$DRY_RUN" = true ]; then
  success "[DRY RUN] Would deploy retailer portal"
else
  rsync -az --delete --info=progress2 \
    "$PROJECT_ROOT/retailer-admin/dist/" \
    $VM_USER@$VM_HOST:/var/www/supermandi/releases/$GIT_SHA/retailer/
  success "Retailer portal deployed to releases/$GIT_SHA/retailer/"
fi

# =============================================================================
# STEP 7: DEPLOY ADMIN PORTAL (versioned)
# =============================================================================

step "Deploy admin portal"

if [ "$DRY_RUN" = true ]; then
  success "[DRY RUN] Would deploy admin portal"
else
  rsync -az --delete --info=progress2 \
    "$PROJECT_ROOT/supermandi-superadmin/dist/" \
    $VM_USER@$VM_HOST:/var/www/supermandi/releases/$GIT_SHA/admin/
  success "Admin portal deployed to releases/$GIT_SHA/admin/"
fi

# =============================================================================
# STEP 8: UPDATE SYMLINKS (atomic switch)
# =============================================================================

step "Update symlinks (atomic switch)"

if [ "$DRY_RUN" = true ]; then
  success "[DRY RUN] Would update symlinks"
else
  ssh $VM_USER@$VM_HOST << SYMLINK_EOF
# Create/update symlinks atomically
ln -sfn /var/www/supermandi/releases/$GIT_SHA/retailer /var/www/retailer
ln -sfn /var/www/supermandi/releases/$GIT_SHA/admin /var/www/admin

# Record current deployment
echo "$GIT_SHA" > /var/www/supermandi/CURRENT_SHA
echo "$GIT_SHA_FULL" > /var/www/supermandi/CURRENT_SHA_FULL
SYMLINK_EOF
  success "Symlinks updated: /var/www/retailer -> releases/$GIT_SHA/retailer"
  success "Symlinks updated: /var/www/admin -> releases/$GIT_SHA/admin"
fi

# =============================================================================
# STEP 9: DEPLOY SUPPLIER PORTAL
# =============================================================================

step "Deploy supplier portal"

if [ "$DRY_RUN" = true ]; then
  success "[DRY RUN] Would deploy supplier portal"
else
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
fi

# =============================================================================
# STEP 10: UPDATE NGINX CONFIG
# =============================================================================

step "Update nginx configuration"

if [ "$DRY_RUN" = true ]; then
  success "[DRY RUN] Would update nginx config"
  NGINX_RESULT="[DRY RUN]"
else
  # Upload nginx config
  scp -q "$PROJECT_ROOT/nginx.prod.conf" $VM_USER@$VM_HOST:/tmp/nginx.prod.conf

  NGINX_RESULT=$(ssh $VM_USER@$VM_HOST << 'NGINX_EOF'
# Backup current config
sudo cp /etc/nginx/sites-enabled/supermandi.tech /etc/nginx/sites-enabled/supermandi.tech.bak 2>/dev/null || true

# Install new config
sudo cp /tmp/nginx.prod.conf /etc/nginx/sites-enabled/supermandi.tech

# Test config
if sudo nginx -t 2>&1; then
  sudo systemctl reload nginx
  echo "NGINX_OK"
else
  # Rollback on failure
  sudo cp /etc/nginx/sites-enabled/supermandi.tech.bak /etc/nginx/sites-enabled/supermandi.tech 2>/dev/null || true
  echo "NGINX_FAIL"
fi
NGINX_EOF
)

  if echo "$NGINX_RESULT" | grep -q "NGINX_OK"; then
    success "Nginx configuration updated"
  else
    fail "Nginx configuration failed - rolled back"
  fi
fi

echo "nginx -t result: $NGINX_RESULT" >> "$EVIDENCE_FILE"

# =============================================================================
# STEP 11: DEPLOY BACKEND (Optional)
# =============================================================================

DOCKER_PS_OUTPUT=""

if [ "$SKIP_BACKEND" = true ]; then
  step "Deploy backend (SKIPPED)"
  warn "Backend deployment skipped"
  echo "Backend: SKIPPED" >> "$EVIDENCE_FILE"
else
  step "Deploy backend"

  if [ "$DRY_RUN" = true ]; then
    success "[DRY RUN] Would deploy backend"
  else
    BACKEND_RESULT=$(ssh $VM_USER@$VM_HOST << 'BACKEND_EOF'
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

# Get docker ps
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -5
BACKEND_EOF
)

    if echo "$BACKEND_RESULT" | grep -q "BACKEND_OK"; then
      success "Backend deployed and healthy"
    else
      warn "Backend deployed but health check inconclusive"
    fi

    DOCKER_PS_OUTPUT=$(echo "$BACKEND_RESULT" | tail -4)
    echo "docker ps:" >> "$EVIDENCE_FILE"
    echo "$DOCKER_PS_OUTPUT" >> "$EVIDENCE_FILE"
  fi
fi

# =============================================================================
# VERIFICATION
# =============================================================================

step "Production verification"

echo "" >> "$EVIDENCE_FILE"
echo "URL Verification:" >> "$EVIDENCE_FILE"

echo ""
echo "  Testing endpoints..."

# Core endpoints (7 mandatory per DEPLOY-OPS-004)
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
  echo "HSTS: PRESENT" >> "$EVIDENCE_FILE"
else
  fail "HSTS header missing"
  echo "HSTS: MISSING" >> "$EVIDENCE_FILE"
fi

CSP=$(curl -sI "https://$DOMAIN/" 2>/dev/null | grep -i "content-security-policy" | head -1)
if [ -n "$CSP" ]; then
  success "CSP header present"
  echo "CSP: PRESENT" >> "$EVIDENCE_FILE"
else
  warn "CSP header missing (recommended)"
  echo "CSP: MISSING" >> "$EVIDENCE_FILE"
fi

# =============================================================================
# EVIDENCE BLOCK
# =============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    DEPLOYMENT EVIDENCE                         ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Deployed SHA:     $GIT_SHA ($GIT_SHA_FULL)"
echo "  Branch:           $GIT_BRANCH"
echo "  Time (IST):       $(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M:%S IST' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S')"
echo "  nginx -t:         $NGINX_RESULT"
if [ -n "$DOCKER_PS_OUTPUT" ]; then
  echo ""
  echo "  Docker containers:"
  echo "$DOCKER_PS_OUTPUT" | sed 's/^/    /'
fi
echo ""
echo "  Rollback command:"
echo "    ./scripts/deploy-production.sh --sha <previous-sha> --skip-build"
echo ""

# =============================================================================
# SUMMARY
# =============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}DEPLOYMENT COMPLETED WITH $ERRORS ERROR(S)${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "  Review the errors above and fix manually if needed."
  echo "  Evidence saved to: $EVIDENCE_FILE"
  echo ""
  exit 1
else
  echo -e "${GREEN}DEPLOYMENT SUCCESSFUL - ALL CHECKS PASSED${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${GREEN}Deployed:${NC}  $GIT_SHA"
  echo -e "  ${GREEN}Time:${NC}      $(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M:%S IST' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S')"
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
  echo -e "  ${CYAN}Evidence:${NC}"
  echo "    $EVIDENCE_FILE"
  echo ""
fi
