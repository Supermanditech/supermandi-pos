#!/bin/bash
# GCP-STG-0700: POS APK pre-build gate
# ALL checks must pass before gradlew assembleRelease
set -e
echo "=== POS APK PRE-BUILD GATE ==="

echo "[1/6] TypeScript..."
npx tsc --noEmit || { echo "❌ FAIL: TypeScript errors"; exit 1; }
echo "✅ TypeScript clean"

echo "[2/6] Fix guard..."
node scripts/fix-guard.js check || { echo "❌ FAIL: Fix drift"; exit 1; }
echo "✅ Fix guard clean"

echo "[3/6] google-services.json..."
[ -f android/app/google-services.json ] || { echo "❌ FAIL: google-services.json missing"; exit 1; }
echo "✅ google-services.json exists"

echo "[4/6] Version match..."
APP_VER=$(node -e "console.log(require('./app.json').expo.version)")
GRADLE_VER=$(grep 'versionName' android/app/build.gradle | head -1 | grep -oP '"[^"]*"' | tr -d '"')
[ "$APP_VER" = "$GRADLE_VER" ] || { echo "❌ FAIL: Version mismatch app.json=$APP_VER build.gradle=$GRADLE_VER"; exit 1; }
echo "✅ Version match: $APP_VER"

echo "[5/6] AndroidManifest permissions..."
MANIFEST=android/app/src/main/AndroidManifest.xml
for perm in CAMERA INTERNET RECORD_AUDIO VIBRATE; do
  grep -q "android.permission.$perm" "$MANIFEST" || { echo "❌ FAIL: Missing permission $perm"; exit 1; }
done
echo "✅ Required permissions present"

echo "[6/6] All checks passed"
echo "=== POS APK PRE-BUILD GATE: ✅ PASS ==="
