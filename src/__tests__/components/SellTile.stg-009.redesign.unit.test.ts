/**
 * STG-009: SellTile redesign verification
 * Source analysis tests to verify:
 * - Stock badge i18n keys exist in both locales
 * - Brand display logic exists
 * - numberOfLines used for name truncation
 * - No hardcoded colors (useThemeColors used)
 * - Horizontal layout with image | name+brand | price+stock
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

describe('STG-009: Stock badge i18n keys', () => {
  it('sell.inStock key exists in en.json', () => {
    expect(enLocale.sell.inStock).toBeDefined();
    expect(typeof enLocale.sell.inStock).toBe('string');
  });

  it('sell.lowStock key exists in en.json', () => {
    expect(enLocale.sell.lowStock).toBeDefined();
    expect(typeof enLocale.sell.lowStock).toBe('string');
  });

  it('sell.outOfStock key exists in en.json', () => {
    expect(enLocale.sell.outOfStock).toBeDefined();
    expect(typeof enLocale.sell.outOfStock).toBe('string');
  });

  it('sell.inStock key exists in hi.json', () => {
    expect(hiLocale.sell.inStock).toBeDefined();
    expect(typeof hiLocale.sell.inStock).toBe('string');
  });

  it('sell.lowStock key exists in hi.json', () => {
    expect(hiLocale.sell.lowStock).toBeDefined();
    expect(typeof hiLocale.sell.lowStock).toBe('string');
  });

  it('sell.outOfStock key exists in hi.json', () => {
    expect(hiLocale.sell.outOfStock).toBeDefined();
    expect(typeof hiLocale.sell.outOfStock).toBe('string');
  });
});

describe('STG-009: Stock badge logic in SellTile', () => {
  it('uses sell.inStock for stock > 10', () => {
    expect(sellTileSource).toContain('t("sell.inStock")');
  });

  it('uses sell.lowStock for stock 1-10', () => {
    expect(sellTileSource).toContain('t("sell.lowStock")');
  });

  it('uses sell.outOfStock for stock = 0', () => {
    expect(sellTileSource).toContain('t("sell.outOfStock")');
  });

  it('renders a stock badge element with testID', () => {
    expect(sellTileSource).toContain('sell-tile-stock-badge');
  });

  it('applies stockColor to badge background with alpha', () => {
    // Badge background uses stockColor + "1A" for 10% opacity
    expect(sellTileSource).toContain("stockColor + \"1A\"");
  });
});

describe('STG-009: Brand display logic', () => {
  it('conditionally renders brand when present', () => {
    expect(sellTileSource).toContain('brand ?');
    expect(sellTileSource).toContain('testID="sell-tile-brand"');
  });

  it('brand text uses textSecondary color from theme', () => {
    expect(sellTileSource).toContain('color: colors.textSecondary');
  });

  it('brand has smaller font than product name', () => {
    // Brand fontSize: 11, Name fontSize: 14
    const brandStyleMatch = sellTileSource.match(/brand:\s*\{[^}]*fontSize:\s*(\d+)/);
    const nameStyleMatch = sellTileSource.match(/name:\s*\{[^}]*fontSize:\s*(\d+)/);
    expect(brandStyleMatch).not.toBeNull();
    expect(nameStyleMatch).not.toBeNull();
    const brandSize = parseInt(brandStyleMatch![1], 10);
    const nameSize = parseInt(nameStyleMatch![1], 10);
    expect(brandSize).toBeLessThan(nameSize);
  });
});

describe('STG-009: Name truncation', () => {
  it('uses numberOfLines={2} for product name', () => {
    expect(sellTileSource).toContain('numberOfLines={2}');
  });

  it('name element has testID sell-tile-name', () => {
    expect(sellTileSource).toContain('testID="sell-tile-name"');
  });
});

describe('STG-009: No hardcoded colors', () => {
  it('uses useThemeColors hook', () => {
    expect(sellTileSource).toContain('useThemeColors()');
  });

  it('does not contain hardcoded hex colors in styles', () => {
    // Extract the createStyles function body
    const stylesStart = sellTileSource.indexOf('function createStyles');
    expect(stylesStart).toBeGreaterThan(-1);
    const stylesBody = sellTileSource.substring(stylesStart);
    // No hex color patterns like "#fff", "#000", "#f0f0f0" in the styles
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
    const matches = stylesBody.match(hexPattern);
    expect(matches).toBeNull();
  });

  it('all color values reference colors.* tokens', () => {
    const stylesStart = sellTileSource.indexOf('function createStyles');
    const stylesBody = sellTileSource.substring(stylesStart);
    // Every color/backgroundColor property should use colors.*
    const colorProps = stylesBody.match(/(?:color|backgroundColor):\s*[^,}]+/g) || [];
    for (const prop of colorProps) {
      expect(prop).toContain('colors.');
    }
  });
});

describe('STG-009: Layout structure', () => {
  it('has a mainRow with flexDirection row for horizontal layout', () => {
    expect(sellTileSource).toContain('mainRow');
    expect(sellTileSource).toContain('flexDirection: "row"');
  });

  it('has centerBlock with flex: 1 for name expansion', () => {
    expect(sellTileSource).toContain('centerBlock');
    const centerMatch = sellTileSource.match(/centerBlock:\s*\{[^}]*flex:\s*1/);
    expect(centerMatch).not.toBeNull();
  });

  it('has rightBlock for price and stock badge alignment', () => {
    expect(sellTileSource).toContain('rightBlock');
    expect(sellTileSource).toContain('alignItems: "flex-end"');
  });

  it('uses ProductImage component for thumbnails', () => {
    expect(sellTileSource).toContain('ProductImage');
    expect(sellTileSource).toContain('uri={image_url}');
  });

  it('ProductImage size is 40', () => {
    expect(sellTileSource).toContain('size={40}');
  });
});

describe('STG-009: SellTileProduct interface unchanged', () => {
  it('interface still exports SellTileProduct', () => {
    expect(sellTileSource).toContain('export interface SellTileProduct');
  });

  it('interface still exports SellTileProps', () => {
    expect(sellTileSource).toContain('export interface SellTileProps');
  });

  it('keeps barcode, name, sellPriceMinor, currentStock fields', () => {
    expect(sellTileSource).toContain('barcode: string');
    expect(sellTileSource).toContain('name: string');
    expect(sellTileSource).toContain('sellPriceMinor: number | null');
    expect(sellTileSource).toContain('currentStock?: number | null');
  });
});
