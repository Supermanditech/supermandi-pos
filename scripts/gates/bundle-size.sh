#!/usr/bin/env bash
# =============================================================================
# ZRP-B-009: Frontend Bundle Size Gate
# Checks portal build output sizes against baseline + tolerance.
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0
BASELINE_FILE=".bundle-baseline.json"
TOLERANCE_PCT=20  # Allow 20% growth over baseline

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP-B-009: Frontend Bundle Size Gate ==="
echo ""

# Portal build directories
declare -A PORTALS
PORTALS=(
  ["retailer-admin"]="retailer-admin/dist"
  ["supermandi-superadmin"]="supermandi-superadmin/dist"
  ["supplier-portal"]="supplier-portal/.next"
  ["supermandi-landing"]="supermandi-landing"
)

# Read baseline if exists
if [ -f "$BASELINE_FILE" ]; then
  echo "Baseline file: $BASELINE_FILE"
else
  echo "No baseline file found. Recording current sizes as baseline."
fi

BUNDLE_FAIL=0
for portal in "${!PORTALS[@]}"; do
  BUILD_DIR="${PORTALS[$portal]}"
  if [ ! -d "$BUILD_DIR" ]; then
    echo "  SKIP: $portal ($BUILD_DIR not found — build may not have run)"
    continue
  fi

  # Calculate directory size in MB
  SIZE_KB=$(du -sk "$BUILD_DIR" 2>/dev/null | cut -f1 || echo "0")
  SIZE_MB=$((SIZE_KB / 1024))

  # Read max from baseline
  if [ -f "$BASELINE_FILE" ]; then
    MAX_MB=$(grep -A1 "\"$portal\"" "$BASELINE_FILE" 2>/dev/null | grep -oP '"maxMB":\s*\K[0-9]+' || echo "0")
  else
    MAX_MB=0
  fi

  if [ "$MAX_MB" -eq 0 ]; then
    echo "  $portal: ${SIZE_MB}MB (no baseline set)"
    continue
  fi

  # Calculate limit with tolerance
  LIMIT_MB=$(( MAX_MB + (MAX_MB * TOLERANCE_PCT / 100) ))

  if [ "$SIZE_MB" -le "$LIMIT_MB" ]; then
    echo "  $portal: ${SIZE_MB}MB (limit: ${LIMIT_MB}MB = ${MAX_MB}MB + ${TOLERANCE_PCT}%)"
  else
    echo "  $portal: ${SIZE_MB}MB EXCEEDS limit ${LIMIT_MB}MB (baseline: ${MAX_MB}MB + ${TOLERANCE_PCT}%)"
    BUNDLE_FAIL=$((BUNDLE_FAIL + 1))
  fi
done

if [ "$BUNDLE_FAIL" -eq 0 ]; then
  gate_pass "ZRP-B-009" "Bundle sizes within limits"
else
  gate_fail "ZRP-B-009" "Bundle size" "$BUNDLE_FAIL portal(s) exceed size limit"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ZRP Bundle Size Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "═══════════════════════════════════════════════════════════════"

echo "ZRP_BUNDLE_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_BUNDLE_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
