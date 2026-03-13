/**
 * STG-483: SellTile.formatPrice() delegates to formatMoney()
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-483: SellTile formatPrice uses formatMoney', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'components', 'sell', 'SellTile.tsx'),
    'utf-8'
  );

  it('should import formatMoney from utils/money', () => {
    expect(source).toContain('import { formatMoney }');
    expect(source).toContain('from "../../utils/money"');
  });

  it('should call formatMoney in formatPrice function', () => {
    const fnBody = source.substring(
      source.indexOf('function formatPrice'),
      source.indexOf('function formatPrice') + 300
    );
    expect(fnBody).toContain('formatMoney(paise)');
  });

  it('should not have duplicate (paise / 100).toFixed formatting', () => {
    // The old duplicate pattern should be removed
    expect(source).not.toContain('(paise / 100).toFixed');
  });

  it('should still support rateUnit suffix', () => {
    const fnBody = source.substring(
      source.indexOf('function formatPrice'),
      source.indexOf('function formatPrice') + 300
    );
    expect(fnBody).toContain('rateUnit');
    expect(fnBody).toContain('/${rateUnit}');
  });
});
