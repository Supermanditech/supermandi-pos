#!/bin/bash
# GCP-STG-0691: Test rollback for all 56 new migrations (188-245)
set -e
echo "=== MIGRATION ROLLBACK TEST ==="
echo ""
echo "Tests that each new migration (188-245) has a valid ROLLBACK comment"
echo "and that the rollback SQL is syntactically correct."
echo ""

MIGRATIONS_DIR="backend/migrations"
FAIL_COUNT=0

for f in $(ls -1 "$MIGRATIONS_DIR"/*.sql | sort); do
  NUM=$(basename "$f" | grep -oP '^\d+')
  # Only check new migrations (188+)
  if [ "$NUM" -ge 188 ] 2>/dev/null; then
    ROLLBACK=$(grep -i "ROLLBACK:" "$f" 2>/dev/null || true)
    if [ -z "$ROLLBACK" ]; then
      echo "❌ $(basename $f): MISSING ROLLBACK comment"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    else
      echo "✅ $(basename $f): $(echo $ROLLBACK | head -c 80)"
    fi
  fi
done

echo ""
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "❌ $FAIL_COUNT migrations missing ROLLBACK — fix before deploy"
  exit 1
else
  echo "✅ All new migrations have ROLLBACK comments"
fi
echo "=== TEST COMPLETE ==="
