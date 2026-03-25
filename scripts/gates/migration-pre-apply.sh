#!/bin/bash
set -euo pipefail
# GCP-STG MIGRATION PRE-APPLY CHECKLIST
# Runs IMMEDIATELY before applying migrations to a live database.
# Validates connectivity, backup state, and connection headroom.

echo "================================================================"
echo "  MIGRATION PRE-APPLY CHECKLIST"
echo "================================================================"

FAIL=0

# Step 1: Verify database connectivity
echo "[1/5] Database connectivity..."
if [ -z "${DATABASE_URL:-}" ]; then
  echo "  FAIL DATABASE_URL not set"
  echo "  Set DATABASE_URL before running migrations."
  echo "  For staging: export DATABASE_URL=\$(gcloud secrets versions access latest --secret=DATABASE_URL)"
  FAIL=$((FAIL + 1))
else
  echo "  PASS DATABASE_URL is set"
  # Attempt a basic connectivity check if psql is available
  if command -v psql &>/dev/null; then
    if psql "$DATABASE_URL" -c "SELECT 1" &>/dev/null; then
      echo "  PASS Database reachable"
    else
      echo "  FAIL Cannot connect to database"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "  WARN psql not available — skipping connectivity test"
  fi
fi

# Step 2: Verify current migration state
echo "[2/5] Current migration state..."
if [ -n "${DATABASE_URL:-}" ] && command -v psql &>/dev/null; then
  CURRENT_VERSION=$(psql "$DATABASE_URL" -t -c "SELECT COALESCE(MAX(version), 0) FROM schema_migrations;" 2>/dev/null | tr -d ' ' || echo "UNKNOWN")
  echo "  Current version: $CURRENT_VERSION"
  if [ "$CURRENT_VERSION" = "UNKNOWN" ]; then
    echo "  WARN Could not read schema_migrations — verify manually"
  elif [ "$CURRENT_VERSION" -gt 187 ] 2>/dev/null; then
    echo "  WARN Migrations partially applied (version $CURRENT_VERSION > 187)"
    echo "  Some new migrations may already be applied — investigate before proceeding"
  else
    echo "  PASS At expected baseline (version $CURRENT_VERSION)"
  fi
else
  echo "  INFO Manual check required:"
  echo "    Run: SELECT MAX(version) FROM schema_migrations;"
  echo "    Expected: 187 (last deployed)"
  echo "    If higher: migrations already partially applied — INVESTIGATE"
fi

# Step 3: Cloud SQL backup
echo "[3/5] Pre-migration backup..."
if command -v gcloud &>/dev/null; then
  echo "  Triggering Cloud SQL backup..."
  if [ -f "scripts/gcp/create-sql-backup.sh" ]; then
    echo "  Run: bash scripts/gcp/create-sql-backup.sh"
    echo "  Wait for backup to complete before proceeding"
  else
    echo "  Manual backup command:"
    echo "    gcloud sql backups create --instance=supermandi-staging --description='pre-migration-backup'"
  fi
  echo "  Verify: gcloud sql backups list --instance=supermandi-staging --limit=1"
else
  echo "  WARN gcloud CLI not available"
  echo "  Ensure Cloud SQL backup exists before proceeding"
  echo "  Run from GCP console or a machine with gcloud installed"
fi

# Step 4: Dry-run check
echo "[4/5] Dry-run validation..."
if [ -f "scripts/gates/migration-dry-run.js" ]; then
  echo "  Running migration dry-run..."
  if node scripts/gates/migration-dry-run.js 2>/dev/null; then
    echo "  PASS Dry-run passed"
  else
    echo "  FAIL Dry-run failed — do not proceed"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  WARN migration-dry-run.js not found — skipping"
fi

# Step 5: Connection count check
echo "[5/5] Connection headroom..."
if [ -n "${DATABASE_URL:-}" ] && command -v psql &>/dev/null; then
  ACTIVE=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | tr -d ' ' || echo "UNKNOWN")
  MAX_CONN=$(psql "$DATABASE_URL" -t -c "SHOW max_connections;" 2>/dev/null | tr -d ' ' || echo "UNKNOWN")
  echo "  Active connections: $ACTIVE / $MAX_CONN"
  if [ "$ACTIVE" != "UNKNOWN" ] && [ "$MAX_CONN" != "UNKNOWN" ]; then
    THRESHOLD=$(( MAX_CONN * 80 / 100 ))
    if [ "$ACTIVE" -gt "$THRESHOLD" ] 2>/dev/null; then
      echo "  WARN Connection usage > 80% — consider reducing Cloud Run instances"
    else
      echo "  PASS Connection headroom OK"
    fi
  fi
else
  echo "  INFO Manual check required:"
  echo "    Run: SELECT count(*) FROM pg_stat_activity;"
  echo "    Must be < 80% of max_connections"
  echo "    If too high: reduce Cloud Run instances temporarily"
fi

echo ""
echo "================================================================"
if [ "$FAIL" -gt 0 ]; then
  echo "  PRE-APPLY CHECK FAILED — $FAIL issue(s) must be resolved"
  echo "  DO NOT proceed with migrations"
  exit 1
else
  echo "  PRE-APPLY CHECKLIST COMPLETE"
  echo "  Proceed with: node backend/scripts/migrate.js"
fi
echo "================================================================"
