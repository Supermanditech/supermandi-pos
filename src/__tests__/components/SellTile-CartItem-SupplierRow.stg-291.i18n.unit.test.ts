/**
 * STG-291: Component-level i18n — SellTile, CartItem, SupplierRow
 * Verifies no hardcoded user-facing strings remain; all use t() or i18n.t().
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const componentsDir = join(__dirname, '..', '..', 'components');

describe('STG-291: SellTile i18n', () => {
  const source = readFileSync(join(componentsDir, 'sell', 'SellTile.tsx'), 'utf-8');

  it('should import useTranslation', () => {
    expect(source).toContain("useTranslation");
  });

  it('should use t() for stock label', () => {
    expect(source).toContain('t("components.sellTile.stockWithCount"');
    expect(source).toContain('t("components.sellTile.stockUnavailable")');
  });

  it('should use t() for expiry text', () => {
    expect(source).toContain('t("components.sellTile.expired")');
    expect(source).toContain('t("components.sellTile.expiryWarning"');
  });

  it('should use t() for mode badge', () => {
    expect(source).toContain('t("components.sellTile.packaged")');
    expect(source).toContain('t("components.sellTile.loose")');
  });

  it('should use t() for GST label', () => {
    expect(source).toContain('t("components.sellTile.gst"');
  });

  it('should not have hardcoded stock/expiry/GST strings', () => {
    // These specific literals should no longer appear as display text
    expect(source).not.toMatch(/"Stock: —"/);
    expect(source).not.toMatch(/`Stock: \$\{/);
    expect(source).not.toMatch(/"⚠ EXPIRED"/);
    expect(source).not.toMatch(/GST \$\{gst_rate\}%/);
  });
});

describe('STG-291: CartItem i18n', () => {
  const source = readFileSync(join(componentsDir, 'buy', 'CartItem.tsx'), 'utf-8');

  it('should import useTranslation', () => {
    expect(source).toContain("useTranslation");
  });

  it('should use t() for MOQ warning', () => {
    expect(source).toContain('t("components.supplierRow.minOrder"');
  });

  it('should not have hardcoded MOQ string', () => {
    expect(source).not.toMatch(/MOQ: \{item\.moq\}/);
  });
});

describe('STG-291: SupplierRow i18n', () => {
  const source = readFileSync(join(componentsDir, 'buy', 'SupplierRow.tsx'), 'utf-8');

  it('should import useTranslation', () => {
    expect(source).toContain("useTranslation");
  });

  it('should use t() for add/addMore buttons', () => {
    expect(source).toContain('t("components.cartItem.addMore")');
    expect(source).toContain('t("components.cartItem.add")');
  });

  it('should use t() for MOQ label', () => {
    expect(source).toContain('t("components.supplierRow.moqLabel")');
  });

  it('should not have hardcoded Add/Add More strings', () => {
    expect(source).not.toMatch(/"Add More"/);
    expect(source).not.toMatch(/"Add"/);
  });
});
