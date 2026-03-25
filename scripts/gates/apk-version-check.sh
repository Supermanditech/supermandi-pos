#!/bin/bash
# GCP-STG-0588: APK version verification
echo "=== APK VERSION CHECK ==="
CODE=$(grep 'versionCode' android/app/build.gradle | head -1 | grep -oP '\d+')
NAME=$(grep 'versionName' android/app/build.gradle | head -1 | grep -oP '"[^"]*"' | tr -d '"')
APP_VER=$(node -e "console.log(require('./app.json').expo.version)")

echo "build.gradle: versionCode=$CODE versionName=$NAME"
echo "app.json: version=$APP_VER"

if [ "$CODE" -le 1 ]; then
  echo "❌ FAIL: versionCode must be > 1 for Play Store release"
  exit 1
fi

if [ "$NAME" = "$APP_VER" ]; then
  echo "✅ Versions match"
else
  echo "❌ FAIL: Version mismatch — build.gradle=$NAME app.json=$APP_VER"
  exit 1
fi

echo "=== VERSION CHECK: ✅ PASS ==="
