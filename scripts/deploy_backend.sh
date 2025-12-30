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
npm ci
npm run build

node -e "const { ensureCoreSchema } = require('./dist/db/ensureSchema'); ensureCoreSchema().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });"

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart "$SERVICE_NAME" || true
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$SERVICE_NAME" || true
fi

echo "Deploy complete."
