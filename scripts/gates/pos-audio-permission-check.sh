#!/bin/bash
# GCP-STG-0590: Verify RECORD_AUDIO permission flow on POS
echo "=== RECORD_AUDIO PERMISSION CHECK ==="

echo "[1/3] AndroidManifest declares RECORD_AUDIO..."
if grep -q "android.permission.RECORD_AUDIO" android/app/src/main/AndroidManifest.xml; then
  echo "✅ RECORD_AUDIO declared in AndroidManifest"
else
  echo "❌ FAIL: RECORD_AUDIO missing from AndroidManifest"
  exit 1
fi

echo "[2/3] voicePermissions.ts requests permission at runtime..."
if grep -q "requestPermissionsAsync\|Audio.requestPermissions" src/services/voice/voicePermissions.ts; then
  echo "✅ Runtime permission request found"
else
  echo "❌ FAIL: No runtime permission request in voicePermissions.ts"
  exit 1
fi

echo "[3/3] Permission denied path handled..."
if grep -q "openSettings\|Linking.openSettings\|denied" src/services/voice/voicePermissions.ts; then
  echo "✅ Permission denied handling found"
else
  echo "⚠️ WARNING: No explicit denied-path handling"
fi

echo "=== RECORD_AUDIO CHECK: ✅ PASS ==="
