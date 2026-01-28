#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/supermandi-pos}"
BACKEND_DIR="${BACKEND_DIR:-$REPO_DIR/backend}"
SERVICE_NAME="${SERVICE_NAME:-supermandi-backend}"

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Backend directory not found: $BACKEND_DIR"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Export it before running."
  exit 1
fi

cd "$REPO_DIR"
git pull

cd "$BACKEND_DIR"

# GL-CRIT-0081: Install only production dependencies for deployment
# Build step requires dev dependencies, so we do a two-phase install
echo "Installing dev dependencies for build..."
npm ci

echo "Building application..."
npm run build

# After build, reinstall without dev dependencies for smaller footprint
echo "Reinstalling without dev dependencies..."
npm ci --omit=dev

node -e "const { ensureCoreSchema } = require('./dist/db/ensureSchema'); ensureCoreSchema().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });"

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart "$SERVICE_NAME" || true
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$SERVICE_NAME" --update-env || true
fi

echo "Deploy complete."
