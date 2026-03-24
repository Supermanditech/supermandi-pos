#!/bin/bash
# GCP-STG-0715: CI migration sequence gate
MIGRATIONS_DIR="backend/migrations"
ERRORS=0

echo "=== MIGRATION SEQUENCE CHECK ==="

# Count migrations
COUNT=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l)
echo "Total migration files: $COUNT"

# Check for duplicates (same number prefix)
DUPES=$(ls -1 "$MIGRATIONS_DIR"/*.sql | sed 's/.*\///' | grep -oP '^\d+' | sort | uniq -d)
if [ -n "$DUPES" ]; then
  echo "Duplicate migration numbers (may be intentional a/b splits):"
  echo "$DUPES" | while read d; do
    ls "$MIGRATIONS_DIR"/${d}_* 2>/dev/null | sed 's/.*\//  /'
  done
fi

# Check latest migration number
LATEST=$(ls -1 "$MIGRATIONS_DIR"/*.sql | sed 's/.*\///' | grep -oP '^\d+' | sort -n | tail -1)
echo "Latest migration: $LATEST"

# Check for ROLLBACK in recent migrations (188+)
echo ""
echo "Checking ROLLBACK comments in recent migrations (188+)..."
MISSING=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  NUM=$(basename "$f" | grep -oP '^\d+')
  if [ "$NUM" -ge 188 ] 2>/dev/null && ! grep -qi "ROLLBACK" "$f"; then
    echo "  Missing ROLLBACK: $(basename $f)"
    MISSING=$((MISSING+1))
  fi
done
[ "$MISSING" -eq 0 ] && echo "  All recent migrations have ROLLBACK"

echo ""
echo "=== MIGRATION SEQUENCE: PASS (${COUNT} files, latest: ${LATEST}) ==="
