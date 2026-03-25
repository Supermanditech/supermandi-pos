#!/bin/bash
# GCP-STG-0702: Auto-increment APK versionCode before release build
set -e
echo "=== APK VERSION BUMP ==="

GRADLE_FILE="android/app/build.gradle"
APP_JSON="app.json"

# Read current versionCode
CURRENT_CODE=$(grep 'versionCode' "$GRADLE_FILE" | head -1 | grep -oP '\d+')
NEW_CODE=$((CURRENT_CODE + 1))

echo "Current versionCode: $CURRENT_CODE"
echo "New versionCode: $NEW_CODE"

# Bump versionCode in build.gradle
sed -i "s/versionCode $CURRENT_CODE/versionCode $NEW_CODE/" "$GRADLE_FILE"

# Read current versionName
CURRENT_NAME=$(grep 'versionName' "$GRADLE_FILE" | head -1 | grep -oP '"[^"]*"' | tr -d '"')

# Auto-bump patch version
IFS='.' read -ra PARTS <<< "$CURRENT_NAME"
MAJOR=${PARTS[0]}
MINOR=${PARTS[1]}
PATCH=${PARTS[2]:-0}
NEW_PATCH=$((PATCH + 1))
NEW_NAME="$MAJOR.$MINOR.$NEW_PATCH"

echo "Current versionName: $CURRENT_NAME"
echo "New versionName: $NEW_NAME"

# Bump versionName in build.gradle
sed -i "s/versionName \"$CURRENT_NAME\"/versionName \"$NEW_NAME\"/" "$GRADLE_FILE"

# Bump version in app.json
sed -i "s/\"version\": \"$CURRENT_NAME\"/\"version\": \"$NEW_NAME\"/" "$APP_JSON"

echo "Version bumped: $CURRENT_NAME ($CURRENT_CODE) -> $NEW_NAME ($NEW_CODE)"
echo ""
echo "Don't forget to commit:"
echo "  git add $GRADLE_FILE $APP_JSON"
echo "  git commit -m 'chore: bump APK version to $NEW_NAME ($NEW_CODE)'"
echo "=== BUMP COMPLETE ==="
