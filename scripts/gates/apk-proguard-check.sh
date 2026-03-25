#!/usr/bin/env bash
# GCP-STG-0622: ProGuard/R8 verification gate
# Checks android/app/build.gradle for minifyEnabled and shrinkResources in release buildType.
set -euo pipefail

GRADLE_FILE="android/app/build.gradle"
ERRORS=0

echo "=== APK ProGuard/R8 Verification ==="
echo ""

if [ ! -f "$GRADLE_FILE" ]; then
  echo "ERROR: $GRADLE_FILE not found"
  exit 1
fi

echo "Checking $GRADLE_FILE for release build optimizations..."
echo ""

# Check minifyEnabled
MINIFY_LINE=$(grep -n 'minifyEnabled' "$GRADLE_FILE" || true)
if [ -z "$MINIFY_LINE" ]; then
  echo "  MISSING: minifyEnabled not found in build.gradle"
  ERRORS=$((ERRORS + 1))
else
  echo "  Found: $MINIFY_LINE"
  if echo "$MINIFY_LINE" | grep -q 'true\|enableProguardInReleaseBuilds'; then
    echo "  Status: minifyEnabled is ON (via enableProguardInReleaseBuilds flag)"
  else
    echo "  WARNING: minifyEnabled may be false — APK will be larger than necessary"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""

# Check shrinkResources
SHRINK_LINE=$(grep -n 'shrinkResources' "$GRADLE_FILE" || true)
if [ -z "$SHRINK_LINE" ]; then
  echo "  MISSING: shrinkResources not found in build.gradle"
  ERRORS=$((ERRORS + 1))
else
  echo "  Found: $SHRINK_LINE"
  if echo "$SHRINK_LINE" | grep -q 'true\|enableShrinkResourcesInReleaseBuilds'; then
    echo "  Status: shrinkResources is controlled by enableShrinkResourcesInReleaseBuilds flag"
  else
    echo "  WARNING: shrinkResources may be false — unused resources included in APK"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""

# Check enableProguardInReleaseBuilds property
PROGUARD_PROP=$(grep -n 'enableProguardInReleaseBuilds' "$GRADLE_FILE" | head -1 || true)
if [ -n "$PROGUARD_PROP" ]; then
  echo "  ProGuard flag: $PROGUARD_PROP"
fi

# Check for proguard-rules.pro
if [ -f "android/app/proguard-rules.pro" ]; then
  RULE_COUNT=$(wc -l < "android/app/proguard-rules.pro")
  echo "  proguard-rules.pro: exists ($RULE_COUNT lines)"
else
  echo "  proguard-rules.pro: NOT FOUND — custom ProGuard rules missing"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "PASS: ProGuard/R8 configuration looks correct"
else
  echo "WARNING: $ERRORS issue(s) found — review release build configuration"
fi
