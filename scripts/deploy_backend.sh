#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# SuperMandi Backend Deployment Script
# GL-CRIT-0081: Production deployment with proper dependency handling
# =============================================================================

REPO_DIR="${REPO_DIR:-/opt/supermandi-pos}"
BACKEND_DIR="${BACKEND_DIR:-$REPO_DIR/backend}"
SERVICE_NAME="${SERVICE_NAME:-supermandi-backend}"

echo "==========================================="
echo "SUPERMANDI BACKEND DEPLOYMENT"
echo "==========================================="
echo ""

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "❌ Backend directory not found: $BACKEND_DIR"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL is not set. Export it before running."
  exit 1
fi

echo "📂 Pulling latest code..."
cd "$REPO_DIR"
git pull

cd "$BACKEND_DIR"

# GL-CRIT-0081: Install only production dependencies for deployment
# Build step requires dev dependencies, so we do a two-phase install
echo ""
echo "📦 Installing dev dependencies for build..."
npm ci

echo ""
echo "🔨 Building application..."
npm run build

# After build, reinstall without dev dependencies for smaller footprint
echo ""
echo "📦 Reinstalling without dev dependencies..."
npm ci --omit=dev

# Run migrations
echo ""
echo "🗄️  Running database migrations..."
echo "   (Includes GL-CRIT-0008 foreign keys, GL-CRIT-0010 soft deletes)"
node -e "const { ensureCoreSchema } = require('./dist/db/ensureSchema'); ensureCoreSchema().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });"
echo "✅ Migrations complete"

# Restart services
echo ""
echo "🔄 Restarting services..."

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart "$SERVICE_NAME" || true
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$SERVICE_NAME" --update-env || true
fi

echo ""
echo "==========================================="
echo "✅ DEPLOYMENT COMPLETE"
echo "==========================================="
echo ""
echo "📋 Deployed GL-CRIT fixes:"
echo "   - 0008: Foreign key constraints"
echo "   - 0010: Soft delete columns"
echo "   - 0050: Docker network isolation"
echo "   - 0051: Voice service API key security"
echo ""
echo "🔍 Verify deployment:"
echo "   pm2 logs $SERVICE_NAME --lines 50"
echo ""
