#!/bin/bash
# GCP-STG-0708: Supplier portal build output verification
set -e
echo "=== SUPPLIER BUILD OUTPUT CHECK ==="

NEXT="supplier-portal/.next"

echo "[1/3] .next/ directory exists..."
[ -d "$NEXT" ] || { echo "FAIL: $NEXT missing — build first"; exit 1; }
echo "OK .next/ exists"

echo "[2/3] Static pages generated..."
PAGES=$(find "$NEXT/server" -name "*.html" 2>/dev/null | wc -l)
echo "   Static pages: $PAGES"
if [ "$PAGES" -lt 1 ]; then
  echo "WARNING: No static pages found — SSR-only or build incomplete"
fi
echo "OK Build output check done"

echo "[3/3] No test files in build..."
TESTS=$(find "$NEXT" -name "*.test.*" -o -name "*.spec.*" 2>/dev/null | wc -l)
if [ "$TESTS" -gt 0 ]; then
  echo "FAIL: Test files found in .next/"
  exit 1
fi
echo "OK No test files in output"

echo "=== SUPPLIER BUILD OUTPUT: PASS ==="
