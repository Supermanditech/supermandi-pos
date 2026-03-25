#!/bin/bash
# GCP-STG-0597: Verify placeholder migrations are safe to re-run
echo "=== PLACEHOLDER MIGRATION CHECK ==="
SAFE=0
UNSAFE=0

for num in 115 116 117 158; do
  FILE=$(ls backend/migrations/${num}*.sql 2>/dev/null | head -1)
  if [ -z "$FILE" ]; then
    echo "WARNING: Migration $num not found"
    continue
  fi

  NAME=$(basename "$FILE")
  # Check for idempotent patterns
  if grep -qi "IF NOT EXISTS\|IF EXISTS\|DO NOTHING\|placeholder\|no-op" "$FILE"; then
    echo "PASS $NAME — idempotent (safe to re-run)"
    SAFE=$((SAFE + 1))
  else
    echo "FAIL $NAME — NOT idempotent (may fail on re-run)"
    UNSAFE=$((UNSAFE + 1))
  fi
done

echo ""
echo "Safe: $SAFE, Unsafe: $UNSAFE"
[ "$UNSAFE" -eq 0 ] && echo "=== ALL SAFE ===" || { echo "=== $UNSAFE UNSAFE ==="; exit 1; }
