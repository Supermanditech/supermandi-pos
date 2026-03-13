/**
 * STG-361: Voice service real product search — stub replaced with catalog bridge
 * Verifies: initProductSearchBridge() is called, stub is removed, bridge queries catalog
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-361: Voice product search integration', () => {
  const voiceRouteSource = readFileSync(
    join(__dirname, '..', 'src', 'routes', 'v1', 'pos', 'voice.ts'),
    'utf-8'
  );

  const bridgeSource = readFileSync(
    join(__dirname, '..', 'src', 'services', 'ai', 'productSearchBridge.ts'),
    'utf-8'
  );

  it('should call initProductSearchBridge() instead of stub', () => {
    expect(voiceRouteSource).toContain('initProductSearchBridge()');
  });

  it('should not contain the empty-array stub', () => {
    expect(voiceRouteSource).not.toContain('return []');
    expect(voiceRouteSource).not.toContain('TODO: Integrate with store-products/search');
  });

  it('should import initProductSearchBridge from productSearchBridge', () => {
    expect(voiceRouteSource).toContain("import { initProductSearchBridge }");
    expect(voiceRouteSource).toContain("productSearchBridge");
  });

  it('bridge should query catalog.store_products with pg_trgm similarity', () => {
    expect(bridgeSource).toContain('catalog.store_products');
    expect(bridgeSource).toContain('similarity');
    expect(bridgeSource).toContain('pg_trgm');
  });

  it('bridge should scope query to store_id', () => {
    expect(bridgeSource).toContain('sp.store_id = $1');
  });

  it('bridge should return top 5 candidates ordered by similarity', () => {
    expect(bridgeSource).toContain('ORDER BY sim_score DESC');
    expect(bridgeSource).toContain('LIMIT 5');
  });

  it('bridge should register via registerProductSearch', () => {
    expect(bridgeSource).toContain('registerProductSearch(searchStoreProducts)');
  });
});
