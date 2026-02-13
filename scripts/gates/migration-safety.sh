#!/usr/bin/env bash
# =============================================================================
# ZRP Category E: Database & Migration Safety Gate
# Gates: ZRP-E-003, ZRP-E-006, ZRP-E-007, ZRP-E-010, ZRP-E-013
# Only scans migrations changed in current PR (legacy grandfathered).
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0
BASE_REF="${BASE_REF:-main}"
MIGRATION_DIR="backend/migrations"

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }
gate_skip() { echo "  SKIP: $1 — $2: $3"; }

echo "=== ZRP Category E: Database & Migration Safety ==="
echo ""

# =============================================================================
# ZRP-E-003: Migration sequential numbering (no duplicate prefixes)
# Checks ALL migrations in the directory (not just changed ones)
# =============================================================================
echo "--- ZRP-E-003: Migration sequential numbering ---"

if [ ! -d "$MIGRATION_DIR" ]; then
  gate_skip "ZRP-E-003" "Sequential numbering" "Migration directory not found"
else
  # Extract numeric prefixes from migration filenames
  PREFIXES=$(ls -1 "$MIGRATION_DIR"/*.sql 2>/dev/null | xargs -I{} basename {} | grep -oE '^[0-9]+' | sort)
  DUPE_COUNT=$(echo "$PREFIXES" | sort | uniq -d | wc -l || echo "0")
  DUPE_COUNT=$(echo "$DUPE_COUNT" | tr -d '[:space:]')

  if [ "$DUPE_COUNT" -eq 0 ]; then
    TOTAL=$(echo "$PREFIXES" | wc -l | tr -d '[:space:]')
    gate_pass "ZRP-E-003" "Sequential numbering ($TOTAL migrations, no duplicate prefixes)"
  else
    DUPES=$(echo "$PREFIXES" | sort | uniq -d | tr '\n' ', ')
    gate_fail "ZRP-E-003" "Sequential numbering" "Duplicate migration prefixes: $DUPES"
  fi
fi

# =============================================================================
# Find new/changed migration files in this PR
# =============================================================================
NEW_MIGRATIONS=$(git diff --name-only --diff-filter=A "${BASE_REF}..HEAD" -- "$MIGRATION_DIR/*.sql" 2>/dev/null || echo "")
CHANGED_MIGRATIONS=$(git diff --name-only "${BASE_REF}..HEAD" -- "$MIGRATION_DIR/*.sql" 2>/dev/null || echo "")

if [ -z "$CHANGED_MIGRATIONS" ]; then
  echo ""
  echo "No migration files changed in this PR. Remaining gates skipped."
  gate_skip "ZRP-E-006" "No destructive DDL" "No migrations changed"
  gate_skip "ZRP-E-007" "Idempotency" "No migrations changed"
  gate_skip "ZRP-E-010" "No seed data" "No migrations changed"
  gate_skip "ZRP-E-013" "Rollback exists" "No migrations changed"
else
  echo ""
  echo "Changed migrations: $(echo "$CHANGED_MIGRATIONS" | wc -l | tr -d '[:space:]') file(s)"

  # ===========================================================================
  # ZRP-E-006: No destructive DDL in new migrations
  # ===========================================================================
  echo ""
  echo "--- ZRP-E-006: No destructive DDL ---"
  DESTRUCTIVE_COUNT=0
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    # Check for destructive statements
    DROPS=$(grep -ciE '^\s*(DROP TABLE|DROP COLUMN|DROP INDEX|TRUNCATE TABLE|ALTER TABLE .+ DROP)' "$file" 2>/dev/null || echo "0")
    if [ "$DROPS" -gt 0 ]; then
      # Check for safety marker: -- ZRP-ALLOW-DESTRUCTIVE
      if ! grep -q 'ZRP-ALLOW-DESTRUCTIVE' "$file" 2>/dev/null; then
        echo "  $file: $DROPS destructive statement(s)"
        DESTRUCTIVE_COUNT=$((DESTRUCTIVE_COUNT + DROPS))
      else
        echo "  $file: $DROPS destructive statement(s) (ALLOWED via marker)"
      fi
    fi
  done <<< "$CHANGED_MIGRATIONS"

  if [ "$DESTRUCTIVE_COUNT" -eq 0 ]; then
    gate_pass "ZRP-E-006" "No destructive DDL"
  else
    gate_fail "ZRP-E-006" "No destructive DDL" "$DESTRUCTIVE_COUNT destructive statement(s) without ZRP-ALLOW-DESTRUCTIVE marker"
  fi

  # ===========================================================================
  # ZRP-E-007: Idempotency markers (IF NOT EXISTS)
  # ===========================================================================
  echo ""
  echo "--- ZRP-E-007: Idempotency markers ---"
  NON_IDEMPOTENT=0
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    # Check CREATE TABLE without IF NOT EXISTS
    CREATES=$(grep -ciE '^\s*CREATE TABLE(?!\s+IF\s+NOT\s+EXISTS)' "$file" 2>/dev/null || echo "0")
    NON_IDEMPOTENT=$((NON_IDEMPOTENT + CREATES))
  done <<< "$CHANGED_MIGRATIONS"

  if [ "$NON_IDEMPOTENT" -eq 0 ]; then
    gate_pass "ZRP-E-007" "Idempotency markers"
  else
    gate_warn "ZRP-E-007" "Idempotency markers" "$NON_IDEMPOTENT CREATE TABLE without IF NOT EXISTS"
  fi

  # ===========================================================================
  # ZRP-E-010: No seed data in production migrations
  # ===========================================================================
  echo ""
  echo "--- ZRP-E-010: No seed data in production migrations ---"
  SEED_COUNT=0
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    # Check for INSERT with static values (not from SELECT)
    INSERTS=$(grep -ciE '^\s*INSERT\s+INTO\s+' "$file" 2>/dev/null || echo "0")
    if [ "$INSERTS" -gt 0 ]; then
      # Allow if tagged with -- SEED: marker or if filename contains "seed"
      if ! grep -q '-- SEED:' "$file" 2>/dev/null && ! echo "$file" | grep -qi 'seed'; then
        echo "  $file: $INSERTS INSERT statement(s) (not tagged as seed)"
        SEED_COUNT=$((SEED_COUNT + INSERTS))
      fi
    fi
  done <<< "$CHANGED_MIGRATIONS"

  if [ "$SEED_COUNT" -eq 0 ]; then
    gate_pass "ZRP-E-010" "No seed data in migrations"
  else
    gate_warn "ZRP-E-010" "No seed data in migrations" "$SEED_COUNT INSERT statements in non-seed migration files"
  fi

  # ===========================================================================
  # ZRP-E-013: Rollback (.down.sql) exists for new migrations
  # ===========================================================================
  echo ""
  echo "--- ZRP-E-013: Rollback files exist ---"
  if [ -n "$NEW_MIGRATIONS" ]; then
    MISSING_DOWN=0
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      DOWN_FILE="${file%.sql}.down.sql"
      if [ ! -f "$DOWN_FILE" ]; then
        echo "  Missing: $DOWN_FILE"
        MISSING_DOWN=$((MISSING_DOWN + 1))
      fi
    done <<< "$NEW_MIGRATIONS"

    if [ "$MISSING_DOWN" -eq 0 ]; then
      gate_pass "ZRP-E-013" "Rollback files exist"
    else
      gate_warn "ZRP-E-013" "Rollback files exist" "$MISSING_DOWN new migration(s) without .down.sql"
    fi
  else
    gate_skip "ZRP-E-013" "Rollback files exist" "No new migrations added"
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ZRP Migration Safety Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "═══════════════════════════════════════════════════════════════"

echo "ZRP_MIGRATION_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_MIGRATION_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL migration safety gate(s) failed."
  exit 1
fi

echo ""
echo "Migration Safety: All blocking gates passed."
exit 0
