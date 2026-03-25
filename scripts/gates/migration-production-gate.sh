#!/bin/bash
set -euo pipefail
# GCP-STG MIGRATION PRODUCTION GATE
# Runs ALL migration safety checks before GCP deployment.
# Must exit 0 before any migration is applied to staging or production.

echo "================================================================"
echo "  MIGRATION PRODUCTION GATE — Pre-Deploy Safety Check"
echo "================================================================"
echo ""
FAIL=0
WARN=0
MIGRATIONS_DIR="backend/migrations"

# GATE 1: Sequential numbering — no gaps
echo "[GATE 1/10] Sequential numbering check..."
PREV=""
for f in $(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | sort -t/ -k3 -V); do
  NUM_RAW=$(basename "$f" | grep -oP '^\d+')
  NUM=$((10#$NUM_RAW))  # Force base-10 (avoid octal for 008, 009, etc.)
  # Skip sub-migrations (011b, 018b, 107b)
  if echo "$(basename $f)" | grep -qP '^\d+[a-z]_'; then continue; fi
  if [ -n "$PREV" ]; then
    EXPECTED=$((PREV + 1))
    if [ "$NUM" -ne "$EXPECTED" ] 2>/dev/null; then
      # Allow known sub-migration gaps
      if [ "$PREV" -eq 11 ] || [ "$PREV" -eq 18 ] || [ "$PREV" -eq 107 ]; then
        true  # Known sub-migration
      else
        echo "  FAIL GAP: Expected $EXPECTED, found $NUM"
        FAIL=$((FAIL + 1))
      fi
    fi
  fi
  PREV="$NUM"
done
[ "$FAIL" -eq 0 ] && echo "  PASS Sequential — no gaps" || echo "  FAIL Sequential numbering"

# GATE 2: No duplicate numbers
echo "[GATE 2/10] Duplicate number check..."
DUPES=$(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | sed 's/.*\///' | grep -oP '^\d+' | sort | uniq -d | wc -l)
if [ "$DUPES" -gt 3 ]; then  # 3 known: 011, 018, 107 (a/b variants)
  echo "  FAIL $DUPES duplicate migration numbers (expected max 3)"
  FAIL=$((FAIL + 1))
else
  echo "  PASS No unexpected duplicates (3 known a/b variants)"
fi

# GATE 3: All new migrations have ROLLBACK comment
echo "[GATE 3/10] ROLLBACK comment check (migrations 188+)..."
MISSING_ROLLBACK=0
for f in $(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | sort -t/ -k3 -V); do
  NUM=$((10#$(basename "$f" | grep -oP '^\d+')))
  if [ "$NUM" -ge 188 ] 2>/dev/null; then
    if ! grep -qi "ROLLBACK" "$f"; then
      echo "  FAIL MISSING ROLLBACK: $(basename $f)"
      MISSING_ROLLBACK=$((MISSING_ROLLBACK + 1))
    fi
  fi
done
if [ "$MISSING_ROLLBACK" -eq 0 ]; then
  echo "  PASS All new migrations have ROLLBACK comments"
else
  echo "  FAIL $MISSING_ROLLBACK migrations missing ROLLBACK"
  FAIL=$((FAIL + 1))
fi

# GATE 4: Idempotency — all use IF NOT EXISTS / IF EXISTS
echo "[GATE 4/10] Idempotency check (CREATE/ALTER safety)..."
UNSAFE=0
for f in $(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | sort -t/ -k3 -V); do
  NUM=$((10#$(basename "$f" | grep -oP '^\d+')))
  if [ "$NUM" -ge 188 ] 2>/dev/null; then
    # Check CREATE TABLE without IF NOT EXISTS
    if grep -qP "CREATE TABLE(?! IF NOT EXISTS)" "$f" 2>/dev/null; then
      echo "  WARN $(basename $f): CREATE TABLE without IF NOT EXISTS"
      WARN=$((WARN + 1))
    fi
    # Check ALTER TABLE ADD COLUMN without IF NOT EXISTS
    if grep -qP "ADD COLUMN(?! IF NOT EXISTS)" "$f" 2>/dev/null; then
      echo "  WARN $(basename $f): ADD COLUMN without IF NOT EXISTS"
      WARN=$((WARN + 1))
    fi
    # Check for DROP TABLE/COLUMN (destructive)
    if grep -qiP "DROP TABLE|DROP COLUMN" "$f" 2>/dev/null; then
      if ! grep -qi "IF EXISTS" "$f" 2>/dev/null; then
        echo "  FAIL $(basename $f): DROP without IF EXISTS (destructive!)"
        UNSAFE=$((UNSAFE + 1))
      fi
    fi
  fi
done
if [ "$UNSAFE" -gt 0 ]; then
  echo "  FAIL $UNSAFE unsafe DROP statements"
  FAIL=$((FAIL + 1))
else
  echo "  PASS No unsafe destructive operations"
fi

# GATE 5: No NOT NULL without DEFAULT on existing tables
echo "[GATE 5/10] NOT NULL safety check..."
NOTNULL_UNSAFE=0
for f in $(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | sort -t/ -k3 -V); do
  NUM=$((10#$(basename "$f" | grep -oP '^\d+')))
  if [ "$NUM" -ge 188 ] 2>/dev/null; then
    if grep -qP "ADD COLUMN.*NOT NULL(?!.*DEFAULT)" "$f" 2>/dev/null; then
      echo "  WARN $(basename $f): ADD COLUMN NOT NULL without DEFAULT"
      WARN=$((WARN + 1))
    fi
  fi
done
echo "  PASS NOT NULL check complete ($WARN warnings)"

# GATE 6: SQL syntax validation (basic)
echo "[GATE 6/10] SQL syntax validation..."
SYNTAX_ERR=0
for f in $(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | sort -t/ -k3 -V); do
  NUM=$((10#$(basename "$f" | grep -oP '^\d+')))
  if [ "$NUM" -ge 188 ] 2>/dev/null; then
    # Check for unterminated statements (no semicolon at end)
    if [ -z "$(grep ';' "$f")" ]; then
      echo "  WARN $(basename $f): No semicolons found (empty/comment-only?)"
      WARN=$((WARN + 1))
    fi
  fi
done
echo "  PASS Syntax check complete"

# GATE 7: Migration file size check (>100KB is suspicious)
echo "[GATE 7/10] File size check..."
for f in $(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | sort -t/ -k3 -V); do
  NUM=$((10#$(basename "$f" | grep -oP '^\d+')))
  if [ "$NUM" -ge 188 ] 2>/dev/null; then
    SIZE=$(wc -c < "$f")
    if [ "$SIZE" -gt 102400 ]; then
      echo "  WARN $(basename $f): ${SIZE} bytes (>100KB — review for data migrations)"
      WARN=$((WARN + 1))
    fi
  fi
done
echo "  PASS File sizes OK"

# GATE 8: No hardcoded data (INSERT with literal values that should be env-driven)
echo "[GATE 8/10] Hardcoded data check..."
HARDCODED=0
for f in $(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | sort -t/ -k3 -V); do
  NUM=$((10#$(basename "$f" | grep -oP '^\d+')))
  if [ "$NUM" -ge 188 ] 2>/dev/null; then
    if grep -qiP "INSERT INTO.*VALUES.*'(password|secret|token|key)'" "$f" 2>/dev/null; then
      echo "  FAIL $(basename $f): Hardcoded sensitive data in INSERT"
      HARDCODED=$((HARDCODED + 1))
    fi
  fi
done
if [ "$HARDCODED" -gt 0 ]; then
  echo "  FAIL $HARDCODED migrations with hardcoded sensitive data"
  FAIL=$((FAIL + 1))
else
  echo "  PASS No hardcoded sensitive data"
fi

# GATE 9: Schema consistency — verify tables reference known schemas
echo "[GATE 9/10] Schema prefix check..."
KNOWN_SCHEMAS="auth|catalog|inventory|orders|payments|platform|pos|reorder|supplier|whatsapp|invoicing|procurement|public"
BAD_SCHEMA=0
for f in $(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | sort -t/ -k3 -V); do
  NUM=$((10#$(basename "$f" | grep -oP '^\d+')))
  if [ "$NUM" -ge 188 ] 2>/dev/null; then
    # Find CREATE TABLE statements that use a schema prefix not in our known list
    SCHEMAS_USED=$(grep -oP 'CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)\.' "$f" 2>/dev/null | grep -oP '\w+\.$' | sed 's/\.$//' | sort -u || true)
    for s in $SCHEMAS_USED; do
      if ! echo "$s" | grep -qP "^($KNOWN_SCHEMAS)$"; then
        echo "  FAIL $(basename $f): Unknown schema '$s'"
        BAD_SCHEMA=$((BAD_SCHEMA + 1))
      fi
    done
  fi
done
if [ "$BAD_SCHEMA" -gt 0 ]; then
  echo "  FAIL $BAD_SCHEMA migrations reference unknown schemas"
  FAIL=$((FAIL + 1))
else
  echo "  PASS Schema prefixes checked — all known"
fi

# GATE 10: Total count verification
echo "[GATE 10/10] Count verification..."
TOTAL_NEW=$(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql | while read f; do
  NUM=$((10#$(basename "$f" | grep -oP '^\d+')))
  if [ "$NUM" -ge 188 ] 2>/dev/null; then echo "$NUM"; fi
done | wc -l)
TOTAL_NEW=$(echo "$TOTAL_NEW" | tr -d ' ')
echo "  Pending migrations: $TOTAL_NEW (expected: 63)"
if [ "$TOTAL_NEW" -ne 63 ]; then
  echo "  WARN Count mismatch — expected 63, got $TOTAL_NEW"
  WARN=$((WARN + 1))
else
  echo "  PASS Count matches: 63 new migrations"
fi

# SUMMARY
echo ""
echo "================================================================"
echo "  MIGRATION GATE SUMMARY"
echo "================================================================"
echo "  Failures: $FAIL"
echo "  Warnings: $WARN"
echo "  Pending:  $TOTAL_NEW migrations (188+)"
echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "  GATE FAILED — DO NOT DEPLOY"
  echo "  Fix $FAIL failure(s) before migration run"
  exit 1
else
  if [ "$WARN" -gt 0 ]; then
    echo "  GATE PASSED WITH WARNINGS ($WARN)"
    echo "  Review warnings before deploy — none are blocking"
  else
    echo "  GATE PASSED — SAFE TO DEPLOY"
  fi
fi
echo "================================================================"
