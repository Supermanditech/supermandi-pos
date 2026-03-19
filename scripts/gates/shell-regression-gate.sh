#!/usr/bin/env bash
# V3-HARDEN-183: Shell regression release gate
# Proves the branded POS shell is production-ready by running:
#   1. Brand token system proof (28 tests)
#   2. Mounted BottomNavV3 + PosRootLayout shell proof (14 tests)
#   3. Mounted SELL/BUY detail-first navigation proof (20 tests)
#   4. Structural checks for canonical token usage
# Exit 0 = PASS, Exit 1 = FAIL

set -euo pipefail
ERRORS=0

echo "=== SHELL REGRESSION GATE ==="
echo ""

# ── Layer 1: Brand token proof ──
echo "── Layer 1: Brand token proof ──"
if npx jest src/__tests__/theme/brand.v3-harden-183.unit.test.ts --no-coverage --silent 2>/dev/null; then
  echo "PASS: Brand token system proof (28 tests)"
else
  echo "FAIL: Brand token system tests failed"
  ERRORS=$((ERRORS + 1))
fi

# ── Layer 2: Shell runtime proof ──
echo ""
echo "── Layer 2: Shell runtime proof ──"
if npx jest src/__tests__/components/shellRuntime.v3-harden-183.test.tsx --no-coverage --silent 2>/dev/null; then
  echo "PASS: Shell runtime proof (14 tests — BottomNav + PosRootLayout)"
else
  echo "FAIL: Shell runtime tests failed"
  ERRORS=$((ERRORS + 1))
fi

# ── Layer 3: Mounted navigation proof ──
echo ""
echo "── Layer 3: Mounted screen navigation proof ──"
if npx jest src/__tests__/screens/detailFirstScreenNav.v3-184.test.tsx --no-coverage --silent 2>/dev/null; then
  echo "PASS: Mounted navigation proof (20 tests — SELL/BUY detail-first + state retention)"
else
  echo "FAIL: Mounted navigation tests failed"
  ERRORS=$((ERRORS + 1))
fi

# ── Layer 4: Canonical token usage ──
echo ""
echo "── Layer 4: Canonical token usage ──"

# Check that brand tokens are exported from theme index
if grep -q "shell.*tabAccents.*cardElevation.*chipColors" src/theme/index.ts; then
  echo "PASS: Brand tokens exported from theme/index.ts"
else
  echo "FAIL: Brand tokens not exported from theme/index.ts"
  ERRORS=$((ERRORS + 1))
fi

# Check that BottomNavV3 uses brand tokens
if grep -q "shell\|typeRhythm\|iconRhythm" src/components/v3/BottomNavV3.tsx; then
  echo "PASS: BottomNavV3 uses brand tokens"
else
  echo "FAIL: BottomNavV3 does not use brand tokens"
  ERRORS=$((ERRORS + 1))
fi

# Check that no hardcoded hex exists in operator surfaces (excluding SVG)
HARDCODED_COUNT=0
for f in src/components/v3/BottomNavV3.tsx src/components/v3/BrandedHeader.tsx src/components/v3/ProductTileV3.tsx src/components/v3/SupplierProductCardV3.tsx src/screens/v3/SellScreenV3.tsx src/screens/v3/BuyScreenV3.tsx src/screens/v3/StoreHubScreenV3.tsx src/screens/v3/MoreScreenV3.tsx; do
  count=$(grep -c "'#[0-9A-Fa-f]\|\"#[0-9A-Fa-f]\|rgba(" "$f" 2>/dev/null || echo 0)
  svg_count=$(grep -c "stroke\|fill\|Svg" "$f" 2>/dev/null || echo 0)
  non_svg=$(grep "'#[0-9A-Fa-f]\|\"#[0-9A-Fa-f]\|rgba(" "$f" 2>/dev/null | grep -v "stroke\|fill\|Svg\|\/\/" | wc -l)
  if [ "$non_svg" -gt 0 ]; then
    echo "  WARN: $(basename $f) has $non_svg non-SVG hardcoded color(s)"
    HARDCODED_COUNT=$((HARDCODED_COUNT + non_svg))
  fi
done
if [ "$HARDCODED_COUNT" -eq 0 ]; then
  echo "PASS: Zero hardcoded colors in operator surfaces (8 files checked)"
else
  echo "FAIL: $HARDCODED_COUNT hardcoded color(s) found in operator surfaces"
  ERRORS=$((ERRORS + 1))
fi

# ── Layer 5: TypeScript typecheck ──
echo ""
echo "── Layer 5: TypeScript typecheck ──"
if npx tsc --noEmit --project tsconfig.json 2>/dev/null; then
  echo "PASS: POS TypeScript typecheck passes"
else
  echo "FAIL: POS TypeScript typecheck failed"
  ERRORS=$((ERRORS + 1))
fi

# ── SUMMARY ──
echo ""
echo "=============================="
if [ $ERRORS -eq 0 ]; then
  echo "=== SHELL REGRESSION GATE: PASS (5 layers, 0 errors) ==="
  exit 0
else
  echo "=== SHELL REGRESSION GATE: FAIL ($ERRORS errors) ==="
  exit 1
fi
