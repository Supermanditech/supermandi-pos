#!/bin/sh
# Docker entrypoint for main-backend
# Runs pending migrations, then starts the Node.js server
set -e

echo "[entrypoint] SuperMandi Main Backend - Starting..."
echo "[entrypoint] NODE_ENV=${NODE_ENV}"

# Wait for PostgreSQL to be truly ready (not just TCP, but accepting queries)
MAX_RETRIES=30
RETRY=0
until node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT 1').then(() => { pool.end(); process.exit(0); }).catch(() => { pool.end(); process.exit(1); });
" 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "[entrypoint] ERROR: PostgreSQL not ready after ${MAX_RETRIES} retries"
    exit 1
  fi
  echo "[entrypoint] Waiting for PostgreSQL... (attempt ${RETRY}/${MAX_RETRIES})"
  sleep 2
done

echo "[entrypoint] PostgreSQL is ready"

# Run pending migrations
echo "[entrypoint] Running database migrations..."
node /app/scripts/migrate-prod.js up

echo "[entrypoint] Migrations complete - starting server..."

# Start the main server
exec node dist/server.js
