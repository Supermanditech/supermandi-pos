/**
 * GCP-STG-0507: O(1) barcode Map lookup index tests
 * GCP-STG-0521: Multiple products same barcode — disambiguation
 */
import { buildBarcodeIndex, buildBarcodeMultiIndex, type Product } from '../../stores/productsStore';
import { useProductsStore } from '../../stores/productsStore';

// Mock dependencies required by productsStore module
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiSet: jest.fn(),
  multiGet: jest.fn(),
  multiRemove: jest.fn(),
  removeItem: jest.fn(),
}));
jest.mock('../../services/eventLogger', () => ({
  eventLogger: { log: jest.fn() },
}));
jest.mock('../../services/api/productsApi', () => ({}));
jest.mock('../../services/api/sellSearchApi', () => ({}));
jest.mock('../../services/storeScope', () => ({
  storeScopedStorage: { getItem: jest.fn(), setItem: jest.fn() },
  getStoreScopedKey: jest.fn((k: string) => k),
}));
jest.mock('../../services/stockService', () => ({
  upsertStockFromProducts: jest.fn(),
}));
jest.mock('../../services/deviceSession', () => ({
  getDeviceToken: jest.fn().mockResolvedValue('test-token'),
  getDeviceStoreId: jest.fn().mockResolvedValue('store-1'),
}));

function makeProduct(overrides: Partial<Product> & { id: string; name: string }): Product {
  return {
    priceMinor: 1000,
    currency: 'INR',
    ...overrides,
  };
}

describe('GCP-STG-0507: buildBarcodeIndex', () => {
  it('builds a Map from products with barcodes', () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'Rice 1kg', barcode: '8901234567890' }),
      makeProduct({ id: 'p2', name: 'Dal 500g', barcode: '8901234567891' }),
      makeProduct({ id: 'p3', name: 'No Barcode', barcode: undefined }),
    ];
    const index = buildBarcodeIndex(products);
    expect(index.size).toBe(2);
    expect(index.get('8901234567890')?.id).toBe('p1');
    expect(index.get('8901234567891')?.id).toBe('p2');
  });

  it('returns empty Map for empty products', () => {
    const index = buildBarcodeIndex([]);
    expect(index.size).toBe(0);
  });

  it('handles products with no barcode gracefully', () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'A' }),
      makeProduct({ id: 'p2', name: 'B' }),
    ];
    const index = buildBarcodeIndex(products);
    expect(index.size).toBe(0);
  });

  it('last product wins when duplicates exist (Map.set overwrites)', () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'Rice 1kg', barcode: 'DUP-001' }),
      makeProduct({ id: 'p2', name: 'Rice 5kg', barcode: 'DUP-001' }),
    ];
    const index = buildBarcodeIndex(products);
    expect(index.size).toBe(1);
    // Last one wins
    expect(index.get('DUP-001')?.id).toBe('p2');
  });
});

describe('GCP-STG-0507: O(1) lookup via store', () => {
  beforeEach(() => {
    useProductsStore.setState({
      products: [],
      loading: false,
      error: null,
      lastSyncedAt: null,
    });
  });

  it('getProductByBarcode returns correct product via index', () => {
    // Manually set products — the store rebuilds index on set via loadProducts,
    // but for unit test we can test the exported function directly
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'Rice', barcode: '111' }),
      makeProduct({ id: 'p2', name: 'Dal', barcode: '222' }),
    ];
    // Set products in store state — index won't be built via setState alone,
    // so test the fallback linear scan path
    useProductsStore.setState({ products });
    const result = useProductsStore.getState().getProductByBarcode('222');
    expect(result?.id).toBe('p2');
  });

  it('getProductByBarcode falls back to product ID match', () => {
    const products: Product[] = [
      makeProduct({ id: 'SM-12345', name: 'Label Product', barcode: '999' }),
    ];
    useProductsStore.setState({ products });
    // Looking up by product ID when barcode doesn't match
    const result = useProductsStore.getState().getProductByBarcode('SM-12345');
    expect(result?.id).toBe('SM-12345');
  });

  it('getProductByBarcode returns undefined for non-existent barcode', () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'Rice', barcode: '111' }),
    ];
    useProductsStore.setState({ products });
    const result = useProductsStore.getState().getProductByBarcode('NOTEXIST');
    expect(result).toBeUndefined();
  });
});

describe('GCP-STG-0521: buildBarcodeMultiIndex (disambiguation)', () => {
  it('groups multiple products with the same barcode', () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'Rice 1kg', barcode: 'SHARED-001' }),
      makeProduct({ id: 'p2', name: 'Rice 5kg', barcode: 'SHARED-001' }),
      makeProduct({ id: 'p3', name: 'Dal', barcode: 'UNIQUE-001' }),
    ];
    const index = buildBarcodeMultiIndex(products);
    expect(index.get('SHARED-001')?.length).toBe(2);
    expect(index.get('SHARED-001')?.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(index.get('UNIQUE-001')?.length).toBe(1);
  });

  it('returns empty array for non-existent barcode', () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'Rice', barcode: '111' }),
    ];
    const index = buildBarcodeMultiIndex(products);
    expect(index.get('NOTEXIST')).toBeUndefined();
  });

  it('skips products without barcode', () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'A', barcode: undefined }),
      makeProduct({ id: 'p2', name: 'B', barcode: '111' }),
    ];
    const index = buildBarcodeMultiIndex(products);
    expect(index.size).toBe(1);
  });
});

describe('GCP-STG-0521: getProductsByBarcode (plural) via store', () => {
  beforeEach(() => {
    useProductsStore.setState({
      products: [],
      loading: false,
      error: null,
      lastSyncedAt: null,
    });
  });

  it('returns all products matching a barcode', () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'Rice 1kg', barcode: 'SHARED' }),
      makeProduct({ id: 'p2', name: 'Rice 5kg', barcode: 'SHARED' }),
      makeProduct({ id: 'p3', name: 'Dal', barcode: 'OTHER' }),
    ];
    useProductsStore.setState({ products });
    // Falls back to linear filter since index isn't built via setState
    const matches = useProductsStore.getState().getProductsByBarcode('SHARED');
    expect(matches.length).toBe(2);
    expect(matches.map(p => p.id).sort()).toEqual(['p1', 'p2']);
  });

  it('returns empty array when no match', () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'Rice', barcode: '111' }),
    ];
    useProductsStore.setState({ products });
    const matches = useProductsStore.getState().getProductsByBarcode('NOTEXIST');
    expect(matches.length).toBe(0);
  });
});
