#!/bin/bash
# =============================================================================
# AUD-999 GO-LIVE FIX SCRIPT
# =============================================================================
# Run this on the VM: ssh supermandi@34.14.220.171
# Or via gcloud: gcloud compute ssh supermandi-vm --zone=asia-south1-a
#
# This script fixes:
# 1. AUD-003-A/AUD-030-A: Set ADMIN_TOKEN environment variable
# 2. AUD-041-A: Apply migration 035 to add 'opening_stock' to ledger constraint
# =============================================================================

set -e
echo ""
echo "========================================"
echo "AUD-999 GO-LIVE FIX - $(date)"
echo "========================================"
echo ""

# Configuration
BACKEND_DIR="${BACKEND_DIR:-/home/supermandi/supermandi-backend}"
ADMIN_TOKEN_VALUE="${ADMIN_TOKEN:-supermandi-admin-$(openssl rand -hex 8)}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# STEP 1: Set ADMIN_TOKEN environment variable
# =============================================================================
echo -e "${YELLOW}[1/5] Setting ADMIN_TOKEN environment variable...${NC}"

# Check current PM2 ecosystem config
if [ -f "$BACKEND_DIR/ecosystem.config.js" ]; then
    if grep -q "ADMIN_TOKEN" "$BACKEND_DIR/ecosystem.config.js"; then
        echo -e "${GREEN}  ADMIN_TOKEN already in ecosystem.config.js${NC}"
    else
        echo "  Adding ADMIN_TOKEN to ecosystem.config.js..."
        # Backup
        cp "$BACKEND_DIR/ecosystem.config.js" "$BACKEND_DIR/ecosystem.config.js.bak.$(date +%Y%m%d%H%M%S)"
        # Add ADMIN_TOKEN to env section
        sed -i "s/env: {/env: {\n        ADMIN_TOKEN: '$ADMIN_TOKEN_VALUE',/" "$BACKEND_DIR/ecosystem.config.js"
        echo -e "${GREEN}  Added ADMIN_TOKEN to ecosystem.config.js${NC}"
    fi
else
    echo "  No ecosystem.config.js found, checking .env file..."
fi

# Also add to .env file if it exists
if [ -f "$BACKEND_DIR/.env" ]; then
    if grep -q "^ADMIN_TOKEN=" "$BACKEND_DIR/.env"; then
        CURRENT_TOKEN=$(grep "^ADMIN_TOKEN=" "$BACKEND_DIR/.env" | cut -d'=' -f2)
        echo -e "${GREEN}  ADMIN_TOKEN already set in .env: ${CURRENT_TOKEN:0:10}...${NC}"
    else
        echo "ADMIN_TOKEN=$ADMIN_TOKEN_VALUE" >> "$BACKEND_DIR/.env"
        echo -e "${GREEN}  Added ADMIN_TOKEN to .env${NC}"
    fi
fi

# Also add to gateway .env if separate
GATEWAY_DIR="$BACKEND_DIR/services/api-gateway"
if [ -f "$GATEWAY_DIR/.env" ]; then
    if ! grep -q "^ADMIN_TOKEN=" "$GATEWAY_DIR/.env"; then
        echo "ADMIN_TOKEN=$ADMIN_TOKEN_VALUE" >> "$GATEWAY_DIR/.env"
        echo -e "${GREEN}  Added ADMIN_TOKEN to gateway .env${NC}"
    fi
fi

echo ""
echo "=== ADMIN_TOKEN VALUE (save this!) ==="
echo -e "${GREEN}$ADMIN_TOKEN_VALUE${NC}"
echo "======================================="
echo ""

# =============================================================================
# STEP 2: Apply migration 035 (opening_stock constraint)
# =============================================================================
echo -e "${YELLOW}[2/5] Applying migration 035 (opening_stock constraint)...${NC}"

# Get database connection string
DB_URL="${DATABASE_URL:-$(grep "^DATABASE_URL=" "$BACKEND_DIR/.env" 2>/dev/null | cut -d'=' -f2-)}"
if [ -z "$DB_URL" ]; then
    DB_HOST="${DATABASE_HOST:-localhost}"
    DB_PORT="${DATABASE_PORT:-5432}"
    DB_NAME="${DATABASE_NAME:-supermandi}"
    DB_USER="${DATABASE_USER:-supermandi}"
    DB_PASS="${DATABASE_PASSWORD:-}"
    if [ -n "$DB_PASS" ]; then
        DB_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
    else
        DB_URL="postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
    fi
fi

echo "  Database URL: ${DB_URL:0:30}..."

# Apply migration 035
MIGRATION_SQL="
BEGIN;

-- Drop the existing CHECK constraint (if exists)
ALTER TABLE inventory.inventory_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_transaction_type;

-- Re-create with 'opening_stock' included
ALTER TABLE inventory.inventory_ledger
  ADD CONSTRAINT chk_ledger_transaction_type CHECK (
    transaction_type IN ('sale', 'sale_return', 'purchase_received', 'adjustment', 'opening_stock')
  );

COMMIT;
"

echo "$MIGRATION_SQL" | psql "$DB_URL" 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}  Migration 035 applied successfully${NC}"
else
    echo -e "${YELLOW}  Migration may have already been applied or constraint exists${NC}"
fi

# Verify constraint
echo "  Verifying constraint..."
VERIFY_SQL="SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_ledger_transaction_type';"
echo "$VERIFY_SQL" | psql "$DB_URL" 2>&1

# =============================================================================
# STEP 3: Pull latest code and rebuild
# =============================================================================
echo ""
echo -e "${YELLOW}[3/5] Pulling latest code...${NC}"
cd "$BACKEND_DIR"

# Stash any local changes
git stash 2>/dev/null || true

# Pull latest from main branch
git fetch origin
git checkout wip/trace-2026-01-15
git pull origin wip/trace-2026-01-15

CURRENT_COMMIT=$(git rev-parse --short HEAD)
echo -e "${GREEN}  Current commit: $CURRENT_COMMIT${NC}"

# Install dependencies if package.json changed
echo ""
echo -e "${YELLOW}[4/5] Installing dependencies and building...${NC}"
npm install
npm run build

# =============================================================================
# STEP 5: Restart services
# =============================================================================
echo ""
echo -e "${YELLOW}[5/5] Restarting services...${NC}"

# Check if using PM2
if command -v pm2 &> /dev/null; then
    pm2 restart all
    sleep 3
    pm2 list
else
    # Docker compose restart
    if [ -f "$BACKEND_DIR/docker-compose.yml" ]; then
        docker-compose restart
    fi
fi

# =============================================================================
# VERIFICATION
# =============================================================================
echo ""
echo "========================================"
echo "VERIFICATION"
echo "========================================"

# Test gateway health
echo ""
echo "Testing Gateway Health..."
curl -s http://localhost:3000/health | jq . || curl -s http://localhost:3000/health

# Test backend health
echo ""
echo "Testing Backend Health..."
curl -s http://localhost:3000/api/v1/retailer-admin/health | jq . || curl -s http://localhost:3000/api/v1/retailer-admin/health

# Test admin auth with new token
echo ""
echo "Testing Admin Auth..."
curl -s -H "x-admin-token: $ADMIN_TOKEN_VALUE" http://localhost:3000/api/v1/admin/stores | jq . 2>/dev/null || \
curl -s -H "x-admin-token: $ADMIN_TOKEN_VALUE" http://localhost:3000/api/v1/admin/stores

echo ""
echo "========================================"
echo -e "${GREEN}GO-LIVE FIX COMPLETE${NC}"
echo "========================================"
echo ""
echo "IMPORTANT: Save this ADMIN_TOKEN for SuperAdmin UI:"
echo -e "${GREEN}$ADMIN_TOKEN_VALUE${NC}"
echo ""
echo "Set this in SuperAdmin UI settings or .env:"
echo "VITE_ADMIN_TOKEN=$ADMIN_TOKEN_VALUE"
echo ""
