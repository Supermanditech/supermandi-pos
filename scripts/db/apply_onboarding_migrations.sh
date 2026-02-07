#!/usr/bin/env bash
# ONB-GATE-002: Apply onboarding migrations (109-113) with verification
# Safe to run multiple times — all migrations are idempotent.
#
# Usage:
#   bash scripts/db/apply_onboarding_migrations.sh
#   DATABASE_URL=postgres://user:pass@host:5432/db bash scripts/db/apply_onboarding_migrations.sh

set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/supermandi}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/../../backend/migrations" && pwd)"
PASS_COUNT=0
FAIL_COUNT=0

echo "============================================"
echo "  Onboarding Migrations — Apply + Verify"
echo "============================================"
echo "DB: ${DB_URL%%@*}@***"
echo "Dir: ${MIGRATIONS_DIR}"
echo ""

apply_migration() {
  local file="$1"
  local name="$(basename "$file")"

  echo "--- Applying: ${name} ---"
  if psql "$DB_URL" -f "$file" 2>&1; then
    echo "[OK] ${name} applied"
    return 0
  else
    echo "[FAIL] ${name} failed to apply"
    return 1
  fi
}

verify_check() {
  local label="$1"
  local sql="$2"

  result=$(psql "$DB_URL" -t -A -c "$sql" 2>/dev/null || echo "ERROR")
  if [ "$result" = "t" ] || [ "$result" = "true" ]; then
    echo "  [PASS] ${label}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  [FAIL] ${label} (got: ${result})"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# --- Apply migrations in order ---
for num in 109 110 111 112 113; do
  file=$(ls "${MIGRATIONS_DIR}/${num}_"*.sql 2>/dev/null | head -1)
  if [ -z "$file" ]; then
    echo "[FAIL] Migration ${num} not found in ${MIGRATIONS_DIR}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    continue
  fi
  apply_migration "$file"
  echo ""
done

# --- Verification checks ---
echo "============================================"
echo "  Verification Checks"
echo "============================================"

# 109: generate_store_code function exists
verify_check "109: generate_store_code() exists" \
  "SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'platform' AND p.proname = 'generate_store_code');"

# 109: store_code_counters table exists
verify_check "109: store_code_counters table exists" \
  "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'store_code_counters');"

# 110: created_via column exists
verify_check "110: stores.created_via column exists" \
  "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'platform' AND table_name = 'stores' AND column_name = 'created_via');"

# 110: ux_stores_gst_number index exists
verify_check "110: ux_stores_gst_number index exists" \
  "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'platform' AND tablename = 'stores' AND indexname = 'ux_stores_gst_number');"

# 111: registration_events table exists
verify_check "111: registration_events table exists" \
  "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'registration_events');"

# 111: idx_reg_events_created index exists
verify_check "111: idx_reg_events_created index exists" \
  "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'auth' AND tablename = 'registration_events' AND indexname = 'idx_reg_events_created');"

# 112: idx_store_users_single_owner index exists
verify_check "112: idx_store_users_single_owner index exists" \
  "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'auth' AND tablename = 'store_users' AND indexname = 'idx_store_users_single_owner');"

# 113: No hard check (it's a data migration), just verify table is accessible
verify_check "113: applications table accessible" \
  "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'applications');"

# --- Summary ---
echo ""
echo "============================================"
TOTAL=$((PASS_COUNT + FAIL_COUNT))
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "  RESULT: PASS (${PASS_COUNT}/${TOTAL} checks)"
else
  echo "  RESULT: FAIL (${FAIL_COUNT}/${TOTAL} checks failed)"
fi
echo "============================================"

exit "$FAIL_COUNT"
