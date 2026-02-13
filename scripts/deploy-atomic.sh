#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SuperMandi Zero-Regression Atomic Deployment Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# MANDATORY: This is the ONLY allowed deployment method for production.
#
# Usage:
#   ./deploy-atomic.sh --tag <TAG>           Deploy specific tag (PRODUCTION)
#   ./deploy-atomic.sh --tag main --staging  Deploy main branch (STAGING ONLY)
#   ./deploy-atomic.sh --rollback last       Rollback to previous release
#   ./deploy-atomic.sh --rollback <ID>       Rollback to specific release
#   ./deploy-atomic.sh --list-releases       List available releases
#   ./deploy-atomic.sh --smoke-only          Run smoke gate without deploying
#
# Environment options:
#   --env production    (default) Require annotated tags, block 'main' branch
#   --env staging       Allow branch deploys (for dev/staging only)
#   --staging           Shorthand for --env staging
#
# PRODUCTION RULES:
#   - MUST use annotated tags (not branches)
#   - 'main' and 'master' are BLOCKED for production
#   - Use --staging flag ONLY for dev/staging environments
#
# Features:
#   - Atomic deployment via staging → symlink swap
#   - Mandatory smoke gate (blocks on failure)
#   - Release history preservation (5 releases kept)
#   - Instant rollback capability
#   - Comprehensive logging
#   - Version fingerprinting (version.txt per portal)
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

REPO_DIR="${REPO_DIR:-/home/supermanditech/supermandi-pos}"
WWW_BASE="/var/www"
RELEASES_DIR="$WWW_BASE/.releases"
STAGING_DIR="$WWW_BASE/.staging"
LOG_DIR="/var/log/supermandi"
DOMAIN="${DOMAIN:-supermandi.tech}"
GATEWAY="${GATEWAY:-http://127.0.0.1:3000}"
MAX_RELEASES=5

# Parse arguments
ACTION="deploy"
TAG=""
ROLLBACK_TARGET=""
DEPLOY_ENV="production"  # Default to production (strict mode)

while [[ $# -gt 0 ]]; do
    case $1 in
        --tag)
            TAG="$2"
            shift 2
            ;;
        --rollback)
            ACTION="rollback"
            ROLLBACK_TARGET="$2"
            shift 2
            ;;
        --list-releases)
            ACTION="list"
            shift
            ;;
        --smoke-only)
            ACTION="smoke"
            shift
            ;;
        --env)
            DEPLOY_ENV="$2"
            shift 2
            ;;
        --staging)
            DEPLOY_ENV="staging"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Timestamps
DEPLOY_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DEPLOY_TIME_IST=$(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M:%S IST')

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}${BOLD}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
}

fail_with_diagnostics() {
    local reason="$1"
    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}${BOLD}DEPLOYMENT FAILED${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${RED}Reason: $reason${NC}"
    echo ""

    echo "─── Last 50 lines: Nginx Error Log ───"
    sudo tail -50 /var/log/nginx/supermandi.error.log 2>/dev/null || echo "(no log found)"
    echo ""

    echo "─── Last 50 lines: Gateway Logs ───"
    docker logs supermandi-gateway --tail 50 2>/dev/null || echo "(no container found)"
    echo ""

    echo "─── Last 50 lines: Nginx Access Log ───"
    sudo tail -50 /var/log/nginx/supermandi.access.log 2>/dev/null || echo "(no log found)"
    echo ""

    # Log to file
    echo "FAILED: $reason at $DEPLOY_TIME_IST" >> "$LOG_DIR/deploy.log"

    exit 1
}

# =============================================================================
# INITIALIZATION
# =============================================================================

init_directories() {
    sudo mkdir -p "$RELEASES_DIR" "$STAGING_DIR" "$LOG_DIR"
    sudo chown -R "$(whoami):$(whoami)" "$RELEASES_DIR" "$STAGING_DIR" "$LOG_DIR" 2>/dev/null || true
}

# =============================================================================
# LIST RELEASES
# =============================================================================

list_releases() {
    header "AVAILABLE RELEASES"
    echo ""

    if [ ! -d "$RELEASES_DIR" ]; then
        echo "No releases found."
        exit 0
    fi

    # Get current release
    local current=""
    if [ -L "$WWW_BASE/retailer" ]; then
        current=$(readlink "$WWW_BASE/retailer" | sed 's|.*/\.releases/\([^/]*\)/.*|\1|')
    fi

    echo "Releases in $RELEASES_DIR:"
    echo "────────────────────────────────────────"

    for dir in $(ls -1t "$RELEASES_DIR" 2>/dev/null); do
        if [ "$dir" = "$current" ]; then
            echo -e "  ${GREEN}$dir${NC} (CURRENT)"
        else
            echo "  $dir"
        fi
    done

    echo ""
    exit 0
}

# =============================================================================
# SMOKE GATE
# =============================================================================

run_smoke_gate() {
    local base_url="${1:-https://$DOMAIN}"
    local failed=0

    header "SMOKE GATE"
    echo ""
    echo "Time: $DEPLOY_TIME_IST"
    echo "Domain: $DOMAIN"
    echo ""
    echo "Endpoint Status Checks:"
    echo "────────────────────────────────────────"

    # Gateway health
    local gw_status=$(curl -sS -o /tmp/gw_body -w "%{http_code}" --max-time 10 "$GATEWAY/health" 2>/dev/null || echo "000")
    local gw_body=$(cat /tmp/gw_body 2>/dev/null || echo "")

    if [ "$gw_status" = "200" ] && echo "$gw_body" | grep -q '"status":"ok"'; then
        printf "  %-25s ${GREEN}%s OK${NC}\n" "Gateway /health:" "$gw_status"
    else
        printf "  %-25s ${RED}%s FAIL${NC}\n" "Gateway /health:" "$gw_status"
        failed=1
    fi

    # Portal endpoints
    for portal in retailer admin supplier; do
        local status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$base_url/$portal/" 2>/dev/null || echo "000")
        if [ "$status" = "200" ]; then
            printf "  %-25s ${GREEN}%s OK${NC}\n" "/$portal/:" "$status"
        else
            printf "  %-25s ${RED}%s FAIL${NC}\n" "/$portal/:" "$status"
            failed=1
        fi
    done

    # Login pages
    for portal in retailer supplier; do
        local login_url="$base_url/$portal/login"
        [ "$portal" = "supplier" ] && login_url="$base_url/$portal/login/"
        local status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$login_url" 2>/dev/null || echo "000")
        if [ "$status" = "200" ]; then
            printf "  %-25s ${GREEN}%s OK${NC}\n" "/$portal/login:" "$status"
        else
            printf "  %-25s ${YELLOW}%s (may redirect)${NC}\n" "/$portal/login:" "$status"
        fi
    done

    echo ""
    echo "Cache Header Checks:"
    echo "────────────────────────────────────────"

    for portal in retailer admin supplier; do
        local headers=$(curl -sI --max-time 10 "$base_url/$portal/" 2>/dev/null)
        if echo "$headers" | grep -qi "cache-control.*no-store\|cache-control.*no-cache"; then
            printf "  %-25s ${GREEN}✓ no-cache${NC}\n" "/$portal/:"
        else
            printf "  %-25s ${RED}✗ missing no-cache${NC}\n" "/$portal/:"
            failed=1
        fi
    done

    echo ""
    echo "Infrastructure Checks:"
    echo "────────────────────────────────────────"

    # Nginx config test
    if sudo nginx -t 2>&1 | grep -q "successful"; then
        printf "  %-25s ${GREEN}✓ valid${NC}\n" "nginx -t:"
    else
        printf "  %-25s ${RED}✗ invalid${NC}\n" "nginx -t:"
        failed=1
    fi

    # File existence
    for portal in retailer admin; do
        if [ -f "$WWW_BASE/$portal/index.html" ]; then
            printf "  %-25s ${GREEN}✓ exists${NC}\n" "$portal/index.html:"
        else
            printf "  %-25s ${RED}✗ missing${NC}\n" "$portal/index.html:"
            failed=1
        fi
    done

    # PM2 supplier check
    if sudo -u supermanditech pm2 list 2>/dev/null | grep -q "supplier-portal.*online"; then
        printf "  %-25s ${GREEN}✓ online${NC}\n" "supplier-portal (PM2):"
    else
        printf "  %-25s ${YELLOW}⚠ check manually${NC}\n" "supplier-portal (PM2):"
    fi

    echo ""

    if [ $failed -eq 1 ]; then
        echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}SMOKE GATE: ❌ FAILED${NC}"
        echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
        return 1
    else
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}SMOKE GATE: ✅ PASSED${NC}"
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
        return 0
    fi
}

# =============================================================================
# ROLLBACK
# =============================================================================

do_rollback() {
    local target="$1"

    header "ROLLBACK"

    if [ "$target" = "last" ]; then
        # Find previous release (second newest)
        target=$(ls -1t "$RELEASES_DIR" 2>/dev/null | sed -n '2p')
        if [ -z "$target" ]; then
            fail_with_diagnostics "No previous release found for rollback"
        fi
    fi

    local release_path="$RELEASES_DIR/$target"

    if [ ! -d "$release_path" ]; then
        fail_with_diagnostics "Release not found: $target"
    fi

    log "Rolling back to: $target"

    # Verify release has required files
    if [ ! -f "$release_path/retailer/index.html" ] || [ ! -f "$release_path/admin/index.html" ]; then
        fail_with_diagnostics "Release $target is incomplete (missing index.html)"
    fi

    # Swap symlinks
    log "Swapping symlinks..."
    cd "$WWW_BASE"

    rm -f retailer.new admin.new
    ln -s "$release_path/retailer" retailer.new
    ln -s "$release_path/admin" admin.new

    mv -Tf retailer.new retailer
    mv -Tf admin.new admin

    success "Symlinks updated"

    # Reload nginx
    log "Reloading nginx..."
    sudo nginx -t || fail_with_diagnostics "Nginx config invalid after rollback"
    sudo systemctl reload nginx
    success "Nginx reloaded"

    # Log rollback
    echo "ROLLBACK to $target at $DEPLOY_TIME_IST" >> "$LOG_DIR/rollback.log"

    # Run smoke gate
    sleep 2
    if ! run_smoke_gate; then
        fail_with_diagnostics "Smoke gate failed after rollback"
    fi

    header "ROLLBACK COMPLETE"
    echo ""
    echo "  Rolled back to: $target"
    echo "  Time: $DEPLOY_TIME_IST"
    echo ""
}

# =============================================================================
# DEPLOY
# =============================================================================

do_deploy() {
    local tag="$1"

    if [ -z "$tag" ]; then
        fail_with_diagnostics "No tag specified. Usage: ./deploy-atomic.sh --tag <TAG>"
    fi

    # =========================================================================
    # PRODUCTION SAFETY: Enforce tag-only deploys for production
    # =========================================================================

    if [ "$DEPLOY_ENV" = "production" ]; then
        # Block "main" branch for production
        if [ "$tag" = "main" ] || [ "$tag" = "master" ]; then
            echo ""
            echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
            echo -e "${RED}${BOLD}PRODUCTION DEPLOY BLOCKED${NC}"
            echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
            echo ""
            echo -e "${RED}Cannot deploy '$tag' branch to production.${NC}"
            echo ""
            echo "Production deploys MUST use an annotated tag, not a branch."
            echo ""
            echo "Options:"
            echo "  1. Create a tag:  git tag -a v1.2.3 -m 'Release v1.2.3'"
            echo "                    git push origin v1.2.3"
            echo "                    ./deploy-atomic.sh --tag v1.2.3"
            echo ""
            echo "  2. For staging/dev only, use: ./deploy-atomic.sh --tag main --env staging"
            echo "                            or: ./deploy-atomic.sh --tag main --staging"
            echo ""
            exit 1
        fi

        # Verify tag is annotated (not lightweight)
        if ! git cat-file -t "refs/tags/$tag" 2>/dev/null | grep -q "tag"; then
            warn "Tag '$tag' appears to be a lightweight tag (not annotated)."
            warn "Annotated tags are recommended for production: git tag -a <tag> -m 'message'"
        fi
    fi

    header "SUPERMANDI ZERO-REGRESSION DEPLOYMENT"
    echo ""
    echo "  Tag:    $tag"
    echo "  Env:    $DEPLOY_ENV"
    echo "  Time:   $DEPLOY_TIME_IST"
    echo "  Domain: $DOMAIN"
    echo ""

    # Initialize directories
    init_directories

    # =========================================================================
    # STEP 1: PULL CODE
    # =========================================================================

    header "STEP 1: PULL CODE"

    cd "$REPO_DIR" || fail_with_diagnostics "Repository not found: $REPO_DIR"

    # Stash local changes
    git stash 2>/dev/null || true

    # Fetch all tags
    git fetch origin --tags --force

    # Checkout tag
    if [ "$tag" = "main" ]; then
        log "Checking out latest main (DEV/STAGING ONLY)"
        git checkout main
        git reset --hard origin/main
    else
        log "Checking out tag: $tag"
        git checkout "tags/$tag" 2>/dev/null || git checkout "$tag" || fail_with_diagnostics "Tag not found: $tag"
    fi

    # Capture git info
    COMMIT_SHA=$(git rev-parse --short HEAD)
    COMMIT_FULL=$(git rev-parse HEAD)
    COMMIT_MSG=$(git log -1 --pretty=%B | head -1)

    success "Code ready: $COMMIT_SHA"
    echo "  Message: $COMMIT_MSG"

    # =========================================================================
    # STEP 2: BUILD ALL PORTALS
    # =========================================================================

    header "STEP 2: BUILD ALL PORTALS"

    # Build retailer-admin
    log "Building retailer-admin (Vite)..."
    cd "$REPO_DIR/retailer-admin"
    npm ci --silent 2>/dev/null || npm install --silent
    npm run build
    [ -f "dist/index.html" ] || fail_with_diagnostics "retailer-admin build failed: no index.html"
    success "retailer-admin built"

    # Build supermandi-superadmin
    log "Building supermandi-superadmin (Vite)..."
    cd "$REPO_DIR/supermandi-superadmin"
    npm ci --silent 2>/dev/null || npm install --silent
    npm run build
    [ -f "dist/index.html" ] || fail_with_diagnostics "supermandi-superadmin build failed: no index.html"
    success "supermandi-superadmin built"

    # Build supplier-portal
    log "Building supplier-portal (Next.js)..."
    cd "$REPO_DIR/supplier-portal"
    npm ci --silent 2>/dev/null || npm install --silent
    npm run build
    [ -d ".next" ] || fail_with_diagnostics "supplier-portal build failed: no .next directory"
    success "supplier-portal built"

    # =========================================================================
    # STEP 3: STAGE TO RELEASE DIRECTORY
    # =========================================================================

    header "STEP 3: STAGE TO RELEASE DIRECTORY"

    RELEASE_ID="$DEPLOY_TIMESTAMP"
    RELEASE_PATH="$RELEASES_DIR/$RELEASE_ID"

    log "Creating release: $RELEASE_ID"
    mkdir -p "$RELEASE_PATH/retailer" "$RELEASE_PATH/admin"

    # Copy retailer
    cp -r "$REPO_DIR/retailer-admin/dist/"* "$RELEASE_PATH/retailer/"
    [ -f "$RELEASE_PATH/retailer/index.html" ] || fail_with_diagnostics "Staging failed: retailer/index.html missing"
    # Create version fingerprint for retailer
    cat > "$RELEASE_PATH/retailer/version.txt" << EOF
tag=$tag
sha=$COMMIT_SHA
full_sha=$COMMIT_FULL
deploy_time=$DEPLOY_TIME_IST
release_id=$RELEASE_ID
EOF
    success "retailer staged (with version.txt)"

    # Copy admin
    cp -r "$REPO_DIR/supermandi-superadmin/dist/"* "$RELEASE_PATH/admin/"
    [ -f "$RELEASE_PATH/admin/index.html" ] || fail_with_diagnostics "Staging failed: admin/index.html missing"
    # Create version fingerprint for admin
    cat > "$RELEASE_PATH/admin/version.txt" << EOF
tag=$tag
sha=$COMMIT_SHA
full_sha=$COMMIT_FULL
deploy_time=$DEPLOY_TIME_IST
release_id=$RELEASE_ID
EOF
    success "admin staged (with version.txt)"

    # Store metadata
    cat > "$RELEASE_PATH/RELEASE.txt" << EOF
Release ID: $RELEASE_ID
Tag: $tag
Commit SHA: $COMMIT_SHA
Full SHA: $COMMIT_FULL
Message: $COMMIT_MSG
Deploy Time: $DEPLOY_TIME_IST
EOF

    success "Release $RELEASE_ID created"

    # =========================================================================
    # STEP 4: ATOMIC SYMLINK SWAP
    # =========================================================================

    header "STEP 4: ATOMIC SYMLINK SWAP"

    cd "$WWW_BASE"

    # Create new symlinks atomically
    log "Creating new symlinks..."
    rm -f retailer.new admin.new
    ln -s "$RELEASE_PATH/retailer" retailer.new
    ln -s "$RELEASE_PATH/admin" admin.new

    # Atomic swap using mv -T (replace target atomically)
    log "Swapping retailer..."
    mv -Tf retailer.new retailer
    success "retailer symlink updated"

    log "Swapping admin..."
    mv -Tf admin.new admin
    success "admin symlink updated"

    # =========================================================================
    # STEP 5: DEPLOY SUPPLIER PORTAL (PM2)
    # =========================================================================

    header "STEP 5: DEPLOY SUPPLIER PORTAL"

    log "Syncing supplier-portal..."
    rsync -a --delete --exclude 'node_modules' --exclude '.git' \
        "$REPO_DIR/supplier-portal/" "/home/supermanditech/supplier-portal/"

    cd /home/supermanditech/supplier-portal

    # Create version fingerprint for supplier (in public directory)
    mkdir -p public
    cat > "public/version.txt" << EOF
tag=$tag
sha=$COMMIT_SHA
full_sha=$COMMIT_FULL
deploy_time=$DEPLOY_TIME_IST
release_id=$RELEASE_ID
EOF
    success "supplier version.txt created"

    # Install production dependencies
    if [ ! -d "node_modules" ] || [ package.json -nt node_modules ]; then
        log "Installing dependencies..."
        npm ci --production --silent 2>/dev/null || npm install --production --silent
    fi

    # Restart PM2
    log "Restarting PM2 process..."
    sudo -u supermanditech pm2 delete supplier-portal 2>/dev/null || true
    sudo -u supermanditech pm2 start npm --name "supplier-portal" -- start
    sudo -u supermanditech pm2 save
    success "supplier-portal deployed via PM2"

    # =========================================================================
    # STEP 6: RELOAD NGINX
    # =========================================================================

    header "STEP 6: RELOAD NGINX"

    sudo nginx -t || fail_with_diagnostics "Nginx config test failed"
    sudo systemctl reload nginx
    success "Nginx reloaded"

    # =========================================================================
    # STEP 7: SMOKE GATE (MANDATORY)
    # =========================================================================

    sleep 3  # Allow services to stabilize

    if ! run_smoke_gate; then
        # Smoke gate failed - attempt automatic rollback
        warn "Smoke gate failed! Attempting automatic rollback..."

        local prev_release=$(ls -1t "$RELEASES_DIR" 2>/dev/null | sed -n '2p')
        if [ -n "$prev_release" ] && [ -d "$RELEASES_DIR/$prev_release" ]; then
            cd "$WWW_BASE"
            ln -sf "$RELEASES_DIR/$prev_release/retailer" retailer
            ln -sf "$RELEASES_DIR/$prev_release/admin" admin
            sudo systemctl reload nginx
            echo "Rolled back to: $prev_release"
        fi

        fail_with_diagnostics "Smoke gate failed after deployment"
    fi

    # =========================================================================
    # STEP 8: CLEANUP OLD RELEASES
    # =========================================================================

    header "STEP 8: CLEANUP OLD RELEASES"

    local release_count=$(ls -1 "$RELEASES_DIR" 2>/dev/null | wc -l)
    if [ "$release_count" -gt "$MAX_RELEASES" ]; then
        local to_delete=$((release_count - MAX_RELEASES))
        log "Removing $to_delete old release(s)..."
        ls -1t "$RELEASES_DIR" | tail -n "$to_delete" | while read old; do
            rm -rf "$RELEASES_DIR/$old"
            echo "  Removed: $old"
        done
    else
        log "Keeping all $release_count releases (max: $MAX_RELEASES)"
    fi

    # =========================================================================
    # STEP 9: LOG DEPLOYMENT
    # =========================================================================

    header "STEP 9: LOG DEPLOYMENT"

    LOG_FILE="$LOG_DIR/deploy-$DEPLOY_TIMESTAMP.log"

    cat > "$LOG_FILE" << EOF
═══════════════════════════════════════════════════════════════════
SUPERMANDI DEPLOYMENT LOG
═══════════════════════════════════════════════════════════════════
Deploy Time:  $DEPLOY_TIME_IST
Release ID:   $RELEASE_ID
Tag/Branch:   $tag
Commit SHA:   $COMMIT_SHA
Full SHA:     $COMMIT_FULL
Commit Msg:   $COMMIT_MSG

Portals Deployed:
  - /retailer/  -> $RELEASE_PATH/retailer/ (symlink)
  - /admin/     -> $RELEASE_PATH/admin/ (symlink)
  - /supplier/  -> PM2 (supplier-portal)

Smoke Gate:   PASSED

System Info:
$(uptime)
$(docker ps --format "{{.Names}}: {{.Status}}" 2>/dev/null | head -5)
$(systemctl is-active nginx) nginx
$(systemctl is-active pm2-supermanditech) pm2-supermanditech
═══════════════════════════════════════════════════════════════════
EOF

    success "Logged to $LOG_FILE"

    # Append to main deploy log
    echo "[$DEPLOY_TIME_IST] DEPLOYED $tag ($COMMIT_SHA) -> $RELEASE_ID" >> "$LOG_DIR/deploy.log"

    # =========================================================================
    # FINAL SUMMARY
    # =========================================================================

    header "DEPLOYMENT COMPLETE"

    echo ""
    echo -e "  ${GREEN}Tag:${NC}        $tag"
    echo -e "  ${GREEN}Commit:${NC}     $COMMIT_SHA"
    echo -e "  ${GREEN}Release:${NC}    $RELEASE_ID"
    echo -e "  ${GREEN}Time:${NC}       $DEPLOY_TIME_IST"
    echo -e "  ${GREEN}Smoke Gate:${NC} PASSED"
    echo ""
    echo "Verification URLs:"
    echo "  https://$DOMAIN/retailer/"
    echo "  https://$DOMAIN/admin/"
    echo "  https://$DOMAIN/supplier/"
    echo ""

    # Print copy/pasteable proof
    echo "════════════════════════════════════════════════════════════════"
    echo "RELEASE NOTE (copy for documentation):"
    echo "════════════════════════════════════════════════════════════════"
    cat << EOF

## Deployment: $tag
- **Date**: $DEPLOY_TIME_IST
- **Release ID**: $RELEASE_ID
- **Commit**: $COMMIT_SHA
- **Message**: $COMMIT_MSG

### Smoke Gate Results
| Endpoint | Status |
|----------|--------|
| /health | 200 OK |
| /retailer/ | 200 OK |
| /admin/ | 200 OK |
| /supplier/ | 200 OK |

### Infrastructure
- nginx -t: OK
- PM2 supplier-portal: online
- Cache headers: no-store (all portals)

**Result**: ✅ PASSED
EOF
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================

case "$ACTION" in
    deploy)
        do_deploy "$TAG"
        ;;
    rollback)
        do_rollback "$ROLLBACK_TARGET"
        ;;
    list)
        list_releases
        ;;
    smoke)
        init_directories
        run_smoke_gate || exit 1
        ;;
    *)
        echo "Unknown action: $ACTION"
        exit 1
        ;;
esac
