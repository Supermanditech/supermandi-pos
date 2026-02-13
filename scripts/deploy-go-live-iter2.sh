#!/bin/bash
# =============================================================================
# GO-LIVE Iteration 2: Deploy Critical Fixes to VM (34.14.220.171)
# =============================================================================
# Fixes deployed:
# - GAP-CRIT-001: Supplier token validation mismatch
# - GAP-CRIT-003: NOT NULL constraint on payments.store_id
# - SA-GAP-001: Pagination total count bug in device enrollments
# - GAP-HIGH-001: FK constraint on payments.store_id
# - GAP-HIGH-004: Missing indexes
# - Updated_at triggers
#
# Prerequisites:
# - SSH access to claude@34.14.220.171
#
# Usage:
#   ./scripts/deploy-go-live-iter2.sh
# =============================================================================

set -e

# Configuration
VM_HOST="claude@34.14.220.171"
REMOTE_DIR="~/supermandi-pos/backend"
BRANCH="main"

echo "================================================"
echo "GO-LIVE Iteration 2: Deploying Critical Fixes"
echo "================================================"
echo ""

# Check SSH connectivity
echo "[1/7] Checking SSH connectivity..."
if ! ssh -o ConnectTimeout=10 "$VM_HOST" "echo 'SSH OK'" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to $VM_HOST"
    echo "Please ensure SSH access is configured."
    exit 1
fi
echo "  ✓ SSH connection verified"
echo ""

# Pull latest code
echo "[2/7] Pulling latest code from $BRANCH..."
ssh "$VM_HOST" "cd $REMOTE_DIR && git fetch origin && git checkout $BRANCH && git pull origin $BRANCH"
echo "  ✓ Code updated"
echo ""

# Run new migration
echo "[3/7] Running database migration 073..."
ssh "$VM_HOST" "cd $REMOTE_DIR && docker exec supermandi-postgres psql -U supermandi -d supermandi -f /app/migrations/073_go_live_iteration2_fixes.sql 2>/dev/null || psql \$DATABASE_URL -f migrations/073_go_live_iteration2_fixes.sql"
echo "  ✓ Migration applied"
echo ""

# Rebuild main-backend (includes device enrollment fix)
echo "[4/7] Rebuilding main-backend..."
ssh "$VM_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml build --no-cache main-backend"
echo "  ✓ main-backend rebuilt"
echo ""

# Rebuild supplier-service (includes token validation fix)
echo "[5/7] Rebuilding supplier-service..."
ssh "$VM_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml build --no-cache supplier-service"
echo "  ✓ supplier-service rebuilt"
echo ""

# Restart services
echo "[6/7] Restarting services..."
ssh "$VM_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d main-backend supplier-service"
echo "  ✓ Services restarted"
echo ""

# Verify health
echo "[7/7] Verifying health endpoints..."
sleep 10  # Wait for services to start

echo "  Main Backend:"
MAIN_HEALTH=$(ssh "$VM_HOST" "curl -s http://localhost:3010/health" || echo "FAILED")
echo "    $MAIN_HEALTH"

echo "  Supplier Service:"
SUPPLIER_HEALTH=$(ssh "$VM_HOST" "curl -s http://localhost:3002/health" || echo "FAILED")
echo "    $SUPPLIER_HEALTH"

echo ""
echo "================================================"
echo "Deployment Complete!"
echo "================================================"
echo ""
echo "Fixes Applied:"
echo "  ✓ GAP-CRIT-001: Supplier token validation now compatible"
echo "  ✓ GAP-CRIT-003: payments.store_id NOT NULL constraint"
echo "  ✓ SA-GAP-001: Device enrollment pagination fixed"
echo "  ✓ GAP-HIGH-001: payments FK to stores"
echo "  ✓ GAP-HIGH-004: Missing indexes added"
echo ""
echo "Next Steps:"
echo "1. Test supplier portal login flow"
echo "2. Test device enrollment list pagination"
echo "3. Run full E2E tests"
echo ""
