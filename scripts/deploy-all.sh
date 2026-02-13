#!/bin/bash
# GO-LIVE-SOP: Standardized Deployment Script for SuperMandi Portals
# This script pulls, builds, deploys all portals and prints proofs

set -e  # Exit on any error

# =============================================================================
# CONFIGURATION
# =============================================================================

REPO_DIR="/home/supermandi/supermandi-pos"
WWW_DIR="/var/www/supermandi"
DOMAIN="supermandi.tech"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# =============================================================================
# STEP 1: PULL LATEST CODE
# =============================================================================

print_header "STEP 1: Pulling Latest Code"

cd "$REPO_DIR"

# Stash any local changes
git stash 2>/dev/null || true

# Fetch and pull
git fetch origin main
git reset --hard origin/main

# Get commit info
COMMIT_SHA=$(git rev-parse --short HEAD)
COMMIT_FULL=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B | head -1)
DEPLOY_TIME=$(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M IST')

print_success "Pulled commit: $COMMIT_SHA"
print_success "Message: $COMMIT_MSG"

# =============================================================================
# STEP 2: BUILD RETAILER ADMIN (Vite)
# =============================================================================

print_header "STEP 2: Building Retailer Admin Portal"

cd "$REPO_DIR/retailer-admin"
npm ci --silent
npm run build

print_success "Retailer Admin built successfully"

# =============================================================================
# STEP 3: BUILD SUPERADMIN (Vite)
# =============================================================================

print_header "STEP 3: Building SuperAdmin Portal"

cd "$REPO_DIR/supermandi-superadmin"
npm ci --silent
npm run build

print_success "SuperAdmin built successfully"

# =============================================================================
# STEP 4: BUILD SUPPLIER PORTAL (Next.js)
# =============================================================================

print_header "STEP 4: Building Supplier Portal"

cd "$REPO_DIR/supplier-portal"
npm ci --silent
npm run build

print_success "Supplier Portal built successfully"

# =============================================================================
# STEP 5: DEPLOY TO /var/www
# =============================================================================

print_header "STEP 5: Deploying to $WWW_DIR"

# Ensure directories exist
sudo mkdir -p "$WWW_DIR/retailer"
sudo mkdir -p "$WWW_DIR/admin"

# Deploy Retailer Admin
echo "Deploying Retailer Admin..."
sudo rm -rf "$WWW_DIR/retailer/"*
sudo cp -r "$REPO_DIR/retailer-admin/dist/"* "$WWW_DIR/retailer/"
print_success "Retailer Admin deployed"

# Deploy SuperAdmin
echo "Deploying SuperAdmin..."
sudo rm -rf "$WWW_DIR/admin/"*
sudo cp -r "$REPO_DIR/supermandi-superadmin/dist/"* "$WWW_DIR/admin/"
print_success "SuperAdmin deployed"

# Supplier Portal runs as Next.js server - restart the service
echo "Restarting Supplier Portal service..."
sudo systemctl restart supplier-portal 2>/dev/null || print_warning "supplier-portal service not configured"

print_success "All portals deployed"

# =============================================================================
# STEP 6: RELOAD NGINX
# =============================================================================

print_header "STEP 6: Reloading Nginx"

sudo nginx -t && sudo systemctl reload nginx
print_success "Nginx reloaded"

# =============================================================================
# STEP 7: PRINT DEPLOYMENT PROOFS
# =============================================================================

print_header "DEPLOYMENT PROOFS"

echo ""
echo "================================================================"
echo "PROOF 1: GIT PROOF"
echo "================================================================"
echo "Commit SHA: $COMMIT_SHA"
echo "Full SHA: $COMMIT_FULL"
echo "Message: $COMMIT_MSG"
echo ""
git show --name-only "$COMMIT_SHA" | head -20
echo ""

echo "================================================================"
echo "PROOF 2: VM FILESYSTEM PROOF"
echo "================================================================"
echo ""
echo "--- Retailer Admin ---"
ls -la "$WWW_DIR/retailer/" | head -10
echo ""
echo "Index HTML timestamp:"
ls -la "$WWW_DIR/retailer/index.html"
echo ""
echo "Assets (hashed JS files):"
ls -la "$WWW_DIR/retailer/assets/"*.js 2>/dev/null | head -5 || echo "No JS files found"
echo ""

echo "--- SuperAdmin ---"
ls -la "$WWW_DIR/admin/" | head -10
echo ""
echo "Index HTML timestamp:"
ls -la "$WWW_DIR/admin/index.html"
echo ""
echo "Assets (hashed JS files):"
ls -la "$WWW_DIR/admin/assets/"*.js 2>/dev/null | head -5 || echo "No JS files found"
echo ""

echo "--- Supplier Portal ---"
echo "(Next.js server mode - checking service status)"
sudo systemctl status supplier-portal --no-pager | head -10 2>/dev/null || echo "Service status unavailable"
echo ""

echo "================================================================"
echo "PROOF 3: LIVE HTTP PROOF"
echo "================================================================"
echo ""
echo "--- Retailer Login ---"
echo "Cache headers:"
curl -sI "https://$DOMAIN/retailer/login" 2>/dev/null | grep -iE "cache-control|pragma|expires" || echo "Could not fetch headers"
echo ""
echo "Index JS reference:"
curl -s "https://$DOMAIN/retailer/" 2>/dev/null | grep -oE 'index-[a-f0-9]+\.js|main-[a-f0-9]+\.js' | head -3 || echo "Could not fetch content"
echo ""

echo "--- SuperAdmin Login ---"
echo "Cache headers:"
curl -sI "https://$DOMAIN/admin/" 2>/dev/null | grep -iE "cache-control|pragma|expires" || echo "Could not fetch headers"
echo ""
echo "Index JS reference:"
curl -s "https://$DOMAIN/admin/" 2>/dev/null | grep -oE 'index-[a-f0-9]+\.js|main-[a-f0-9]+\.js' | head -3 || echo "Could not fetch content"
echo ""

echo "--- Supplier Login ---"
echo "Cache headers:"
curl -sI "https://$DOMAIN/supplier/login/" 2>/dev/null | grep -iE "cache-control|pragma|expires" || echo "Could not fetch headers"
echo ""

print_header "DEPLOYMENT COMPLETE"
echo ""
echo -e "${GREEN}Build SHA: $COMMIT_SHA${NC}"
echo -e "${GREEN}Deploy Time: $DEPLOY_TIME${NC}"
echo ""
echo "Verification URLs:"
echo "  https://$DOMAIN/retailer/login"
echo "  https://$DOMAIN/retailer/register"
echo "  https://$DOMAIN/supplier/login/"
echo "  https://$DOMAIN/supplier/register/"
echo "  https://$DOMAIN/admin/"
echo ""
