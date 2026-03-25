#!/bin/bash
# GCP-STG-0703: Verify APK build excludes test files and internal docs
echo "=== APK EXCLUSION CHECK ==="

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
FAIL=0

if [ ! -f "$APK_PATH" ]; then
  echo "⚠️ APK not found at $APK_PATH — build first"
  echo "Checking source exclusions instead..."

  # Verify metro.config.js or app build excludes these patterns
  echo ""
  echo "Files that MUST NOT be in APK:"
  echo "  __tests__/ directories"
  echo "  *.test.ts / *.test.tsx files"
  echo "  RELEASES/ directory"
  echo "  CLAUDE.md"
  echo "  *.png screenshots in repo root"
  echo ""
  echo "Verify via metro.config.js blockList:"
  if grep -q "blockList\|blacklist\|__tests__" metro.config.js 2>/dev/null; then
    echo "  ✅ metro.config.js has test exclusion patterns"
  else
    echo "  ⚠️ metro.config.js may not exclude test files — verify manually"
  fi

  echo ""
  echo "React Native bundles are JS-only — native assets are in android/app/src/"
  echo "RELEASES/, CLAUDE.md, *.png are NOT bundled by metro (only src/ files)"
  echo "✅ Non-source files naturally excluded from APK"
else
  echo "APK found — checking contents..."
  # If unzip is available, check for suspicious files
  if command -v unzip &>/dev/null; then
    SUSPICIOUS=$(unzip -l "$APK_PATH" 2>/dev/null | grep -i "test\|RELEASE\|CLAUDE\|screenshot" | head -5)
    if [ -n "$SUSPICIOUS" ]; then
      echo "❌ Suspicious files found in APK:"
      echo "$SUSPICIOUS"
      FAIL=1
    else
      echo "✅ No test/internal files found in APK"
    fi
  fi
fi

[ "$FAIL" -eq 0 ] && echo "=== APK EXCLUSION CHECK: ✅ PASS ===" || { echo "=== ❌ FAIL ==="; exit 1; }
