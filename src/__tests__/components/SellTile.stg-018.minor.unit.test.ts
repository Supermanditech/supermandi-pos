/**
 * SellTile minor fixes verification (STG-018, STG-020, STG-027, STG-046, STG-056)
 *
 * Source-analysis tests verifying:
 * - STG-018: Unit/weight context already shown via packSizeLabel + formatPrice
 * - STG-020: Compact padding/margins (no excess whitespace)
 * - STG-027: No green grid/tag icon present (nothing to fix)
 * - STG-046: Accessibility hint with i18n key sell.tapForDetails
 * - STG-056: Haptic feedback + android_ripple on press
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const sellTileSource = readFileSync(
  join(__dirname, '..', '..', 'components', 'sell', 'SellTile.tsx'),
  'utf-8'
);

const enLocale = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'i18n', 'locales', 'en.json'), 'utf-8')
);

const hiLocale = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'i18n', 'locales', 'hi.json'), 'utf-8')
);

// =============================================================================
// STG-018: Unit/weight context in prices
// =============================================================================

describe('STG-018: Unit/weight context shown near price', () => {
  it('packSizeLabel renders "per <unit>" for LOOSE mode', () => {
    expect(sellTileSource).toContain('per ${rateUnit}');
  });

  it('formatPrice appends /<rateUnit> for LOOSE products', () => {
    expect(sellTileSource).toContain('${formatted}/${rateUnit}');
  });

  it('packSize uses i18n perUnit key for LOOSE mode', () => {
    expect(sellTileSource).toContain("components.sellTile.perUnit");
  });

  it('perUnit i18n key exists in en.json', () => {
    expect(enLocale.components.sellTile.perUnit).toBe('per {{unit}}');
  });

  it('perUnit i18n key exists in hi.json', () => {
    expect(hiLocale.components.sellTile.perUnit).toBeDefined();
    expect(typeof hiLocale.components.sellTile.perUnit).toBe('string');
  });

  it('PACKAGED mode shows net_content_value + unit (e.g. "500 g")', () => {
    expect(sellTileSource).toContain('`${value} ${unit}`');
  });
});

// =============================================================================
// STG-020: No excess whitespace in small cards
// =============================================================================

describe('STG-020: Compact padding/margins', () => {
  it('tile padding is 10 (compact)', () => {
    expect(sellTileSource).toMatch(/padding:\s*10/);
  });

  it('tile marginBottom is 8 (compact)', () => {
    expect(sellTileSource).toMatch(/marginBottom:\s*8/);
  });

  it('mainRow gap is 8 (compact)', () => {
    // mainRow uses gap: 8
    expect(sellTileSource).toMatch(/mainRow.*?gap:\s*8/s);
  });

  it('no excessive padding (>= 16) on tile', () => {
    // Extract tile style block and verify no large padding
    const tileMatch = sellTileSource.match(/tile:\s*\{([^}]+)\}/);
    expect(tileMatch).toBeTruthy();
    const paddingMatch = tileMatch![1].match(/padding:\s*(\d+)/);
    expect(paddingMatch).toBeTruthy();
    expect(Number(paddingMatch![1])).toBeLessThan(16);
  });
});

// =============================================================================
// STG-027: No green grid/tag icon present
// =============================================================================

describe('STG-027: No green grid/tag icon in SellTile', () => {
  it('does not contain any grid icon references', () => {
    expect(sellTileSource).not.toMatch(/grid-?icon|GridIcon|grid-?view/i);
  });

  it('does not contain any tag icon references', () => {
    expect(sellTileSource).not.toMatch(/TagIcon|tag-?icon/i);
  });

  it('does not import any icon library', () => {
    // SellTile should not need icons - it uses text badges
    expect(sellTileSource).not.toContain('@expo/vector-icons');
  });
});

// =============================================================================
// STG-046: Accessibility hint with i18n
// =============================================================================

describe('STG-046: Accessibility hint for tap interaction', () => {
  it('uses sell.tapForDetails i18n key', () => {
    expect(sellTileSource).toContain('sell.tapForDetails');
  });

  it('sets accessibilityHint on the tile', () => {
    expect(sellTileSource).toContain('accessibilityHint');
  });

  it('sell.tapForDetails key exists in en.json', () => {
    expect(enLocale.sell.tapForDetails).toBe('Tap for details');
  });

  it('sell.tapForDetails key exists in hi.json', () => {
    expect(hiLocale.sell.tapForDetails).toBeDefined();
    expect(hiLocale.sell.tapForDetails).toContain('टैप');
  });
});

// =============================================================================
// STG-056: Haptic vibration + ripple on tap
// =============================================================================

describe('STG-056: Haptic feedback + android_ripple', () => {
  it('imports hapticFeedback utility', () => {
    expect(sellTileSource).toContain("import { hapticFeedback }");
    expect(sellTileSource).toContain("utils/haptics");
  });

  it('calls hapticFeedback.light() on press', () => {
    expect(sellTileSource).toContain('hapticFeedback.light()');
  });

  it('imports Pressable from react-native', () => {
    expect(sellTileSource).toContain('Pressable');
    expect(sellTileSource).toMatch(/import.*Pressable.*from.*react-native/);
  });

  it('configures android_ripple with primary color + 20% opacity', () => {
    expect(sellTileSource).toContain('android_ripple');
    expect(sellTileSource).toContain('colors.primary + "20"');
  });

  it('accepts onPress prop in SellTileProps', () => {
    expect(sellTileSource).toContain('onPress?:');
  });

  it('wraps in Pressable when onPress is provided', () => {
    expect(sellTileSource).toContain('onPress ? Pressable : View');
  });
});
