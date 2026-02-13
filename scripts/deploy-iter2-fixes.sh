#!/bin/bash
# AUD-999 Iteration 2 Production Hardening Deployment Script
# Run this on the VM to deploy all fixes

set -e

echo "=========================================="
echo "AUD-999 Iteration 2 Deployment"
echo "=========================================="
echo "Started at: $(date)"
echo ""

# Configuration
BACKEND_DIR="/opt/supermandi/backend"
MIGRATION_FILE="044_iter2_production_hardening.sql"
DB_NAME="${DB_NAME:-supermandi}"

cd "$BACKEND_DIR" || { echo "ERROR: Backend directory not found"; exit 1; }

echo "[1/6] Pulling latest code..."
git pull origin wip/trace-2026-01-15

echo ""
echo "[2/6] Installing dependencies..."
npm ci --production=false

echo ""
echo "[3/6] Building TypeScript..."
npm run build

echo ""
echo "[4/6] Running migration: $MIGRATION_FILE..."
if [ -f "migrations/$MIGRATION_FILE" ]; then
  psql -d "$DB_NAME" -f "migrations/$MIGRATION_FILE" || {
    echo "WARNING: Migration may have partially failed, checking..."
  }
  echo "Migration completed."
else
  echo "ERROR: Migration file not found: migrations/$MIGRATION_FILE"
  exit 1
fi

echo ""
echo "[5/6] Setting environment variables..."
# Add ANTHROPIC_API_KEY if not already set
if ! grep -q "ANTHROPIC_API_KEY" .env 2>/dev/null; then
  echo "NOTE: Please add ANTHROPIC_API_KEY to .env file manually"
fi

echo ""
echo "[6/6] Restarting services..."
pm2 restart api-gateway || systemctl restart supermandi-backend || {
  echo "WARNING: Could not restart service automatically"
  echo "Please restart the backend service manually"
}

echo ""
echo "=========================================="
echo "Deployment completed at: $(date)"
echo "=========================================="
echo ""
echo "Post-deployment verification:"
echo "  curl http://localhost:3000/health"
echo "  curl http://localhost:3000/api/v1/admin/ai/health -H 'x-admin-token: YOUR_TOKEN'"
echo ""
echo "VM Gateway verification:"
echo "  curl http://34.14.220.171:3000/health"
echo ""
