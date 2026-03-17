#!/usr/bin/env bash
# V3-HARDEN-106: Maestro E2E runner for POS app
# Usage:
#   ./scripts/e2e-maestro.sh                    # run all .maestro/ flows
#   ./scripts/e2e-maestro.sh sell               # run only v3-sell-home-smoke
#   ./scripts/e2e-maestro.sh --ci               # CI mode (no retry, XML output)
#
# Prerequisites:
#   - Maestro CLI installed: curl -Ls https://get.maestro.mobile.dev | bash
#   - Android device/emulator connected: adb devices
#   - APK installed: adb install -r android/app/build/outputs/apk/release/app-release.apk

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAESTRO_DIR="$REPO_ROOT/.maestro"
REPORT_DIR="$REPO_ROOT/maestro-report"

# Parse args
FLOW=""
CI_MODE=false
for arg in "$@"; do
  case "$arg" in
    --ci) CI_MODE=true ;;
    sell) FLOW="v3-sell-home-smoke.yaml" ;;
    pos-smoke) FLOW="pos-smoke.yaml" ;;
    reorder) FLOW="reorder-flow.yaml" ;;
    *) FLOW="$arg" ;;
  esac
done

# Check maestro is installed
if ! command -v maestro &>/dev/null; then
  echo "ERROR: maestro CLI not found."
  echo "Install: curl -Ls https://get.maestro.mobile.dev | bash"
  exit 1
fi

# Check device connected
if ! adb devices 2>/dev/null | grep -q "device$"; then
  echo "ERROR: No Android device/emulator connected."
  echo "Start an emulator or connect a device via USB."
  exit 1
fi

# Check app installed
APP_ID="com.supermanditech.supermandipos"
if ! adb shell pm list packages 2>/dev/null | grep -q "$APP_ID"; then
  echo "ERROR: $APP_ID not installed on device."
  echo "Install: adb install -r android/app/build/outputs/apk/release/app-release.apk"
  exit 1
fi

mkdir -p "$REPORT_DIR"

echo "=== Maestro E2E Runner ==="
echo "Device: $(adb devices | grep 'device$' | head -1 | cut -f1)"
echo "App: $APP_ID"
echo ""

if [ -n "$FLOW" ]; then
  FLOW_PATH="$MAESTRO_DIR/$FLOW"
  if [ ! -f "$FLOW_PATH" ]; then
    echo "ERROR: Flow not found: $FLOW_PATH"
    exit 1
  fi
  echo "Running flow: $FLOW"
  if $CI_MODE; then
    maestro test "$FLOW_PATH" --format junit --output "$REPORT_DIR/maestro-results.xml"
  else
    maestro test "$FLOW_PATH"
  fi
else
  echo "Running all flows in $MAESTRO_DIR"
  FAILED=0
  for flow in "$MAESTRO_DIR"/*.yaml; do
    name="$(basename "$flow")"
    echo ""
    echo "--- $name ---"
    if $CI_MODE; then
      maestro test "$flow" --format junit --output "$REPORT_DIR/${name%.yaml}.xml" || FAILED=$((FAILED+1))
    else
      maestro test "$flow" || FAILED=$((FAILED+1))
    fi
  done
  if [ $FAILED -gt 0 ]; then
    echo ""
    echo "FAILED: $FAILED flow(s) failed"
    exit 1
  fi
fi

echo ""
echo "=== Maestro E2E PASSED ==="
