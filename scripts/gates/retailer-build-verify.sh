#!/bin/bash
# GCP-STG-0705: Retailer web build output verification
set -e
echo "=== RETAILER BUILD OUTPUT CHECK ==="

DIST="retailer-admin/dist"

echo "[1/4] dist/index.html exists..."
[ -f "$DIST/index.html" ] || { echo "FAIL: $DIST/index.html missing"; exit 1; }
echo "OK index.html exists"

echo "[2/4] Bundle size check..."
SIZE=$(du -sb "$DIST" 2>/dev/null | awk '{print $1}' || stat -f%z "$DIST" 2>/dev/null || echo 0)
SIZE_KB=$((SIZE / 1024))
SIZE_MB=$((SIZE / 1024 / 1024))
echo "   Bundle size: ${SIZE_KB}KB (${SIZE_MB}MB)"
if [ "$SIZE_MB" -gt 10 ]; then
  echo "FAIL: Bundle > 10MB — investigate large imports"
  exit 1
fi
echo "OK Bundle size OK"

echo "[3/4] No source maps in production..."
MAPS=$(find "$DIST" -name "*.map" 2>/dev/null | wc -l)
if [ "$MAPS" -gt 0 ]; then
  echo "WARNING: $MAPS source map files found — should not ship to production"
fi
echo "OK Source map check done"

echo "[4/4] No test files in dist..."
TESTS=$(find "$DIST" -name "*.test.*" -o -name "*.spec.*" -o -name "__tests__" 2>/dev/null | wc -l)
if [ "$TESTS" -gt 0 ]; then
  echo "FAIL: Test files found in dist/"
  exit 1
fi
echo "OK No test files in output"

echo "=== RETAILER BUILD OUTPUT: PASS ==="
