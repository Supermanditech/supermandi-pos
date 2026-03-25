#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0647 — Hindi i18n completeness verification gate
# ────────────────────────────────────────────────────────────────
# Compares English (en.json) and Hindi (hi.json) translation files
# to detect missing keys, extra keys, and placeholder mismatches.
#
# Usage:  bash scripts/gates/i18n-completeness-check.sh
# Exit 0: all keys present in both locales
# Exit 1: missing or extra keys detected
# ────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

EN_FILE="$ROOT_DIR/src/i18n/locales/en.json"
HI_FILE="$ROOT_DIR/src/i18n/locales/hi.json"

ERRORS=0

echo "=== i18n Completeness Check ==="
echo ""

# ── 1. Check files exist ──────────────────────────────────────
if [ ! -f "$EN_FILE" ]; then
  echo "❌ FAIL: English translation file not found: $EN_FILE"
  echo ""
  echo "  ACTION REQUIRED: Create src/i18n/locales/en.json with all UI strings."
  echo "  Recommended structure: flat key-value JSON, e.g."
  echo '  { "login.title": "Login", "sell.scan": "Scan barcode", ... }'
  exit 1
fi

if [ ! -f "$HI_FILE" ]; then
  echo "❌ FAIL: Hindi translation file not found: $HI_FILE"
  echo ""
  echo "  ACTION REQUIRED: Create src/i18n/locales/hi.json mirroring en.json keys."
  exit 1
fi

echo "EN file: $EN_FILE"
echo "HI file: $HI_FILE"
echo ""

# ── 2. Extract keys (all leaf-level keys using jq-like approach) ──
# Uses node for reliable JSON key extraction (handles nested objects)
EN_KEYS=$(node -e "
  const path = require('path');
  const fs = require('fs');
  const root = path.resolve(__dirname || '.', process.argv[1]);
  const data = JSON.parse(fs.readFileSync(root, 'utf8'));
  function flatKeys(obj, prefix) {
    let keys = [];
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? prefix + '.' + k : k;
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        keys = keys.concat(flatKeys(v, p));
      } else {
        keys.push(p);
      }
    }
    return keys;
  }
  flatKeys(data, '').sort().forEach(k => console.log(k));
" -- "$EN_FILE")

HI_KEYS=$(node -e "
  const path = require('path');
  const fs = require('fs');
  const root = path.resolve(__dirname || '.', process.argv[1]);
  const data = JSON.parse(fs.readFileSync(root, 'utf8'));
  function flatKeys(obj, prefix) {
    let keys = [];
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? prefix + '.' + k : k;
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        keys = keys.concat(flatKeys(v, p));
      } else {
        keys.push(p);
      }
    }
    return keys;
  }
  flatKeys(data, '').sort().forEach(k => console.log(k));
" -- "$HI_FILE")

EN_COUNT=$(echo "$EN_KEYS" | wc -l | tr -d ' ')
HI_COUNT=$(echo "$HI_KEYS" | wc -l | tr -d ' ')

echo "English keys: $EN_COUNT"
echo "Hindi keys:   $HI_COUNT"
echo ""

# ── 3. Find missing Hindi translations ────────────────────────
MISSING_IN_HI=$(comm -23 <(echo "$EN_KEYS") <(echo "$HI_KEYS") || true)
if [ -n "$MISSING_IN_HI" ]; then
  MISSING_COUNT=$(echo "$MISSING_IN_HI" | wc -l | tr -d ' ')
  echo "❌ FAIL: $MISSING_COUNT keys in EN but missing in HI:"
  echo "$MISSING_IN_HI" | head -20
  if [ "$MISSING_COUNT" -gt 20 ]; then
    echo "  ... and $((MISSING_COUNT - 20)) more"
  fi
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo "✅ All English keys have Hindi translations"
fi

# ── 4. Find extra Hindi keys (not in English) ─────────────────
EXTRA_IN_HI=$(comm -13 <(echo "$EN_KEYS") <(echo "$HI_KEYS") || true)
if [ -n "$EXTRA_IN_HI" ]; then
  EXTRA_COUNT=$(echo "$EXTRA_IN_HI" | wc -l | tr -d ' ')
  echo "⚠️  WARNING: $EXTRA_COUNT keys in HI but not in EN:"
  echo "$EXTRA_IN_HI" | head -20
  if [ "$EXTRA_COUNT" -gt 20 ]; then
    echo "  ... and $((EXTRA_COUNT - 20)) more"
  fi
  echo ""
fi

# ── 5. Check for placeholder mismatches ({{var}} patterns) ────
echo "--- Placeholder check ---"
PLACEHOLDER_ERRORS=0
while IFS= read -r key; do
  EN_VAL=$(node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const keys = process.argv[2].split('.');
    let val = data;
    for (const k of keys) { val = val?.[k]; }
    console.log(typeof val === 'string' ? val : '');
  " -- "$EN_FILE" "$key")
  HI_VAL=$(node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const keys = process.argv[2].split('.');
    let val = data;
    for (const k of keys) { val = val?.[k]; }
    console.log(typeof val === 'string' ? val : '');
  " -- "$HI_FILE" "$key")
  EN_PLACEHOLDERS=$(echo "$EN_VAL" | grep -oE '\{\{[^}]+\}\}' | sort || true)
  HI_PLACEHOLDERS=$(echo "$HI_VAL" | grep -oE '\{\{[^}]+\}\}' | sort || true)
  if [ "$EN_PLACEHOLDERS" != "$HI_PLACEHOLDERS" ] && [ -n "$EN_PLACEHOLDERS" ]; then
    echo "  ❌ Placeholder mismatch in key: $key"
    echo "     EN: $EN_PLACEHOLDERS"
    echo "     HI: $HI_PLACEHOLDERS"
    PLACEHOLDER_ERRORS=$((PLACEHOLDER_ERRORS + 1))
  fi
done <<< "$(echo "$EN_KEYS" | head -50)"

if [ "$PLACEHOLDER_ERRORS" -eq 0 ]; then
  echo "✅ Placeholder check passed (sampled first 50 keys)"
else
  echo "❌ $PLACEHOLDER_ERRORS placeholder mismatches found"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ── 6. Summary ─────────────────────────────────────────────────
if [ "$ERRORS" -gt 0 ]; then
  echo "=== RESULT: FAIL — $ERRORS issue(s) found ==="
  exit 1
else
  echo "=== RESULT: PASS — i18n completeness verified ==="
  echo "  English: $EN_COUNT keys"
  echo "  Hindi:   $HI_COUNT keys"
  echo "  Coverage: 100%"
  exit 0
fi
