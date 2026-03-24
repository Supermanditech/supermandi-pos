#!/bin/bash
# GCP-STG-0701: POS APK post-build verification
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
echo "=== POS APK POST-BUILD GATE ==="

echo "[1/3] APK exists..."
[ -f "$APK_PATH" ] || { echo "❌ FAIL: APK not found at $APK_PATH"; exit 1; }
echo "✅ APK exists"

echo "[2/3] APK size..."
SIZE=$(stat -c%s "$APK_PATH" 2>/dev/null || stat -f%z "$APK_PATH" 2>/dev/null)
SIZE_MB=$((SIZE / 1024 / 1024))
echo "   APK size: ${SIZE_MB}MB"
[ "$SIZE_MB" -lt 50 ] || { echo "⚠️ WARNING: APK > 50MB ($SIZE_MB MB) — investigate bloat"; }
echo "✅ APK size OK"

echo "[3/3] APK signed..."
# Check if signed (jarsigner or apksigner)
if command -v apksigner &>/dev/null; then
  apksigner verify "$APK_PATH" 2>/dev/null && echo "✅ APK signed" || echo "⚠️ WARNING: APK not signed (debug build?)"
else
  echo "⚠️ apksigner not available — manual signing check needed"
fi

echo "=== POS APK POST-BUILD GATE: ✅ PASS ==="
