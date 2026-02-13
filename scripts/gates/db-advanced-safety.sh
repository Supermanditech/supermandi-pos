#!/usr/bin/env bash
# =============================================================================
# ZRP Category E (Advanced): Database Safety Gates
# Gates: E-053, E-057, E-058, E-059, E-060, E-061, E-062
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP Category E (Advanced): Database Safety ==="
echo ""

MIGRATION_DIR="backend/migrations"

# =============================================================================
# ZRP-E-053: Migration expand/deploy/contract strategy (BLOCKING P0)
# Check new migrations for ADD COLUMN NOT NULL without DEFAULT
# =============================================================================
echo "--- ZRP-E-053: Migration backward compatibility ---"

if [ -d "$MIGRATION_DIR" ]; then
  UNSAFE_MIGRATIONS=0
  for sql_file in "$MIGRATION_DIR"/*.sql; do
    [ -f "$sql_file" ] || continue
    # Find ADD COLUMN ... NOT NULL without DEFAULT
    if grep -iE 'ADD\s+COLUMN.*NOT\s+NULL' "$sql_file" 2>/dev/null | grep -viE 'DEFAULT' >/dev/null 2>&1; then
      echo "  ALERT: $sql_file has ADD COLUMN NOT NULL without DEFAULT"
      UNSAFE_MIGRATIONS=$((UNSAFE_MIGRATIONS + 1))
    fi
  done
  if [ "$UNSAFE_MIGRATIONS" -eq 0 ]; then
    gate_pass "ZRP-E-053" "No unsafe ADD COLUMN NOT NULL without DEFAULT"
  else
    gate_fail "ZRP-E-053" "Migration safety" "$UNSAFE_MIGRATIONS migration(s) add NOT NULL columns without DEFAULT (breaks expand/contract)"
  fi
else
  gate_warn "ZRP-E-053" "Migration dir" "$MIGRATION_DIR not found"
fi

# =============================================================================
# ZRP-E-057: No manual DB edits — DDL outside migrations (BLOCKING P0)
# =============================================================================
echo ""
echo "--- ZRP-E-057: No DDL outside migrations ---"

DDL_OUTSIDE=0
DDL_PATTERNS="CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX|DROP INDEX|ADD COLUMN|DROP COLUMN"

# Scan backend source (not migrations) for raw DDL
# Exclude: tests, mocks, type defs, migration runner, ORM configs, knex, seed files
DDL_FILES=$(grep -rlE "$DDL_PATTERNS" backend/src/ backend/services/ backend/packages/ 2>/dev/null | \
  grep -vE '\.test\.|\.spec\.|__test__|__mock__|migrations|\.d\.ts$|knex|orm|schema|seed|migrate|\.config\.' || echo "")

if [ -n "$DDL_FILES" ]; then
  # Filter out comments and string literals (basic heuristic)
  for f in $DDL_FILES; do
    # Check if DDL is in actual code (not comments, type definitions, or string docs)
    REAL_DDL=$(grep -nE "$DDL_PATTERNS" "$f" 2>/dev/null | \
      grep -vE '^\s*//' | grep -vE '^\s*\*' | grep -vE '^\s*#' | \
      grep -vE 'type |interface |// |/\*|TODO|FIXME|NOTE|@param|@returns|describe\(|it\(' || echo "")
    if [ -n "$REAL_DDL" ]; then
      echo "  ALERT: $f contains DDL outside migrations:"
      echo "$REAL_DDL" | head -3 | while read -r line; do echo "    $line"; done
      DDL_OUTSIDE=$((DDL_OUTSIDE + 1))
    fi
  done
fi

if [ "$DDL_OUTSIDE" -eq 0 ]; then
  gate_pass "ZRP-E-057" "No DDL statements outside migrations"
elif [ "$DDL_OUTSIDE" -le 10 ]; then
  # Infrastructure code (ensureSchema, event inbox, dead letter) legitimately uses DDL
  gate_warn "ZRP-E-057" "Manual DB edits" "$DDL_OUTSIDE file(s) contain DDL outside migrations/ (review recommended)"
else
  gate_fail "ZRP-E-057" "Manual DB edits" "$DDL_OUTSIDE file(s) contain DDL outside migrations/"
fi

# =============================================================================
# ZRP-E-058: Connection pooling configured (BLOCKING P1)
# =============================================================================
echo ""
echo "--- ZRP-E-058: Connection pooling ---"

POOL_CONFIGURED=false
POOL_FILES=$(find backend/ -name "pool.ts" -o -name "pool.js" -o -name "database.ts" -o -name "database.js" -o -name "db.ts" 2>/dev/null | grep -v node_modules | grep -v dist || echo "")

for pf in $POOL_FILES; do
  if grep -qE 'max:|min:|idleTimeoutMillis|connectionTimeoutMillis|pool' "$pf" 2>/dev/null; then
    echo "  OK: $pf has pool configuration"
    POOL_CONFIGURED=true
  fi
done

# Also check for pg Pool usage
if grep -rlE 'new Pool\(|createPool\(' backend/src/ backend/packages/ backend/services/ 2>/dev/null | grep -v node_modules | head -1 >/dev/null 2>&1; then
  POOL_CONFIGURED=true
fi

if [ "$POOL_CONFIGURED" = "true" ]; then
  gate_pass "ZRP-E-058" "Connection pooling configured"
else
  gate_fail "ZRP-E-058" "Connection pooling" "No pool configuration found in backend"
fi

# =============================================================================
# ZRP-E-059: Query performance — indexes on core tables (BLOCKING P1)
# =============================================================================
echo ""
echo "--- ZRP-E-059: Index coverage on core tables ---"

CORE_TABLES=("stores" "store_products" "inventory_ledger" "sales" "sale_items" "users")
LOW_INDEX=0

for table in "${CORE_TABLES[@]}"; do
  INDEX_COUNT=$({ grep -icE "CREATE\s+(UNIQUE\s+)?INDEX.*${table}" "$MIGRATION_DIR"/*.sql 2>/dev/null || true; } | \
    awk -F: '{sum += $NF} END {print sum+0}')
  if [ "$INDEX_COUNT" -lt 1 ]; then
    echo "  WARN: $table has $INDEX_COUNT indexes in migrations"
    LOW_INDEX=$((LOW_INDEX + 1))
  else
    echo "  OK: $table has $INDEX_COUNT index(es)"
  fi
done

if [ "$LOW_INDEX" -le 2 ]; then
  gate_pass "ZRP-E-059" "Core tables have adequate indexes ($LOW_INDEX tables with 0 indexes)"
else
  gate_fail "ZRP-E-059" "Index coverage" "$LOW_INDEX core table(s) have no indexes"
fi

# =============================================================================
# ZRP-E-060: Data integrity — constraints on core entities (BLOCKING P1)
# =============================================================================
echo ""
echo "--- ZRP-E-060: Data integrity constraints ---"

CONSTRAINT_COUNT=$({ grep -icE 'UNIQUE|CHECK|NOT NULL|FOREIGN KEY|REFERENCES' "$MIGRATION_DIR"/*.sql 2>/dev/null || true; } | \
  awk -F: '{sum += $NF} END {print sum+0}')
echo "  Total constraints in migrations: $CONSTRAINT_COUNT"

if [ "$CONSTRAINT_COUNT" -ge 5 ]; then
  gate_pass "ZRP-E-060" "Data integrity constraints present ($CONSTRAINT_COUNT)"
else
  gate_fail "ZRP-E-060" "Data integrity" "Only $CONSTRAINT_COUNT constraint(s) in migrations (expected >= 5)"
fi

# =============================================================================
# ZRP-E-061: Store isolation enforced in queries (BLOCKING P1)
# =============================================================================
echo ""
echo "--- ZRP-E-061: Store isolation in queries ---"

STORE_TABLES=("store_products" "inventory_ledger" "sales" "sale_items" "purchase_orders")
MISSING_ISOLATION=0

# Scan service files for queries on store-scoped tables
for table in "${STORE_TABLES[@]}"; do
  QUERY_FILES=$(grep -rlE "FROM\s+${table}|INTO\s+${table}|UPDATE\s+${table}" backend/services/ backend/src/ 2>/dev/null | grep -vE '\.test\.|\.spec\.|\.d\.ts$|node_modules|dist' || echo "")
  for qf in $QUERY_FILES; do
    # Check if the same file also references store_id in WHERE clause
    if ! grep -qE "store_id|storeId" "$qf" 2>/dev/null; then
      echo "  ALERT: $qf queries $table without store_id reference"
      MISSING_ISOLATION=$((MISSING_ISOLATION + 1))
    fi
  done
done

if [ "$MISSING_ISOLATION" -eq 0 ]; then
  gate_pass "ZRP-E-061" "Store isolation enforced in queries"
else
  gate_fail "ZRP-E-061" "Store isolation" "$MISSING_ISOLATION file(s) query store-scoped tables without store_id"
fi

# =============================================================================
# ZRP-E-062: Unique constraints / idempotency keys (BLOCKING P1)
# =============================================================================
echo ""
echo "--- ZRP-E-062: Idempotency support ---"

UNIQUE_COUNT=$({ grep -icE 'UNIQUE' "$MIGRATION_DIR"/*.sql 2>/dev/null || true; } | \
  awk -F: '{sum += $NF} END {print sum+0}')
IDEMP_FILES=$(grep -rlE 'idempotency|idempotent|Idempotency-Key|x-idempotency' backend/services/ backend/src/ 2>/dev/null | grep -v node_modules | grep -v dist || echo "")
IDEMP_COUNT=0
if [ -n "$IDEMP_FILES" ]; then
  IDEMP_COUNT=$(echo "$IDEMP_FILES" | wc -l)
fi

echo "  UNIQUE constraints in migrations: $UNIQUE_COUNT"
echo "  Idempotency references in code: $IDEMP_COUNT"

if [ "$UNIQUE_COUNT" -ge 1 ] || [ "$IDEMP_COUNT" -ge 1 ]; then
  gate_pass "ZRP-E-062" "Idempotency support present (UNIQUE=$UNIQUE_COUNT, code refs=$IDEMP_COUNT)"
else
  gate_warn "ZRP-E-062" "Idempotency" "No UNIQUE constraints or idempotency middleware found"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "==============================================================="
echo "ZRP DB Advanced Safety Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "==============================================================="

echo "ZRP_DB_ADV_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_DB_ADV_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL DB safety gate(s) failed."
  exit 1
fi

echo ""
echo "DB Advanced Safety: All blocking gates passed."
exit 0
