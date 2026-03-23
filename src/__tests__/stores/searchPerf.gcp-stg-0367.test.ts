/**
 * GCP-STG-0367: POS Search — Pre-Compute Lowercase, Cap Results
 *
 * Tests:
 * 1. attachSearchFields populates _search* fields
 * 2. searchProducts uses pre-computed fields (no toLowerCase per call)
 * 3. searchProducts caps results at 100
 * 4. cartIdSet/cartBarcodeSet provide O(1) membership (logic test)
 */

// --- Mocks (must come before imports) ---
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
      removeItem: jest.fn(async (key: string) => { delete store[key]; }),
      multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, store[k] ?? null] as [string, string | null])),
      multiSet: jest.fn(async (pairs: [string, string][]) => { for (const [k, v] of pairs) store[k] = v; }),
      multiRemove: jest.fn(async (keys: string[]) => { for (const k of keys) delete store[k]; }),
      getAllKeys: jest.fn(async () => Object.keys(store)),
      clear: jest.fn(async () => { for (const k of Object.keys(store)) delete store[k]; }),
    },
  };
});

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { API_URL: 'http://test.local:3000' } } },
}));

jest.mock('../../services/deviceSession', () => ({
  getDeviceStoreId: jest.fn().mockResolvedValue('TEST-STORE-001'),
  getDeviceToken: jest.fn().mockResolvedValue('test-token'),
}));

jest.mock('../../services/eventLogger', () => ({
  eventLogger: { log: jest.fn() },
}));

jest.mock('../../services/stockService', () => ({
  upsertStockFromProducts: jest.fn(),
}));

jest.mock('../../services/api/productsApi', () => ({
  listProductsProgressive: jest.fn(),
  getProductPriceSources: jest.fn(),
  resolvePriceMinorFromSources: jest.fn(),
}));

jest.mock('../../services/api/sellSearchApi', () => ({
  checkCatalogFreshness: jest.fn(),
  fetchDeltaSync: jest.fn(),
}));

import { attachSearchFields, useProductsStore, type Product } from '../../stores/productsStore';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: overrides.id ?? `prod-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? 'Test Product',
    priceMinor: overrides.priceMinor ?? 1000,
    currency: overrides.currency ?? 'INR',
    barcode: overrides.barcode,
    category: overrides.category,
    brand: overrides.brand,
    description: overrides.description,
    stock: overrides.stock ?? 10,
    ...overrides,
  };
}

describe('GCP-STG-0367: attachSearchFields', () => {
  it('populates all _search* fields as lowercase', () => {
    const p = makeProduct({
      name: 'Amul Butter',
      brand: 'Amul',
      barcode: 'ABC123',
      category: 'Dairy',
      description: 'Fresh butter 500g',
    });

    const result = attachSearchFields(p);

    expect(result._searchName).toBe('amul butter');
    expect(result._searchBrand).toBe('amul');
    expect(result._searchBarcode).toBe('abc123');
    expect(result._searchCategory).toBe('dairy');
    expect(result._searchDescription).toBe('fresh butter 500g');
  });

  it('handles missing optional fields gracefully', () => {
    const p = makeProduct({ name: 'Plain Item' });
    delete p.brand;
    delete p.barcode;
    delete p.category;
    delete p.description;

    const result = attachSearchFields(p);

    expect(result._searchName).toBe('plain item');
    expect(result._searchBrand).toBe('');
    expect(result._searchBarcode).toBe('');
    expect(result._searchCategory).toBe('');
    expect(result._searchDescription).toBe('');
  });

  it('mutates product in place and returns it', () => {
    const p = makeProduct({ name: 'Widget' });
    const returned = attachSearchFields(p);
    expect(returned).toBe(p);
    expect(p._searchName).toBe('widget');
  });
});

describe('GCP-STG-0367: searchProducts with pre-computed fields and cap', () => {
  beforeEach(() => {
    // Reset store
    useProductsStore.setState({ products: [], loading: false, error: null, lastSyncedAt: null });
  });

  it('uses pre-computed _searchName for matching', () => {
    const products = [
      makeProduct({ id: 'p1', name: 'Amul Butter' }),
      makeProduct({ id: 'p2', name: 'Tata Salt' }),
      makeProduct({ id: 'p3', name: 'Amul Milk' }),
    ];
    products.forEach(attachSearchFields);
    useProductsStore.setState({ products });

    const results = useProductsStore.getState().searchProducts('amul');
    expect(results.length).toBe(2);
    expect(results.map(r => r.id).sort()).toEqual(['p1', 'p3']);
  });

  it('matches on brand via _searchBrand', () => {
    const products = [
      makeProduct({ id: 'p1', name: 'Butter', brand: 'Amul' }),
      makeProduct({ id: 'p2', name: 'Salt', brand: 'Tata' }),
    ];
    products.forEach(attachSearchFields);
    useProductsStore.setState({ products });

    const results = useProductsStore.getState().searchProducts('tata');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('p2');
  });

  it('matches on barcode via _searchBarcode', () => {
    const products = [
      makeProduct({ id: 'p1', name: 'Item A', barcode: 'XYZ789' }),
      makeProduct({ id: 'p2', name: 'Item B', barcode: 'ABC123' }),
    ];
    products.forEach(attachSearchFields);
    useProductsStore.setState({ products });

    const results = useProductsStore.getState().searchProducts('abc');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('p2');
  });

  it('caps results at 100', () => {
    const products: Product[] = [];
    for (let i = 0; i < 200; i++) {
      const p = makeProduct({ name: `Apple Product ${i}`, id: `p-${i}` });
      attachSearchFields(p);
      products.push(p);
    }
    useProductsStore.setState({ products });

    const results = useProductsStore.getState().searchProducts('apple');
    expect(results.length).toBe(100);
    expect(results[0].id).toBe('p-0');
    expect(results[99].id).toBe('p-99');
  });

  it('returns all products when query is empty', () => {
    const products = [
      makeProduct({ id: 'p1', name: 'A' }),
      makeProduct({ id: 'p2', name: 'B' }),
    ];
    products.forEach(attachSearchFields);
    useProductsStore.setState({ products });

    const results = useProductsStore.getState().searchProducts('');
    expect(results.length).toBe(2);
  });

  it('falls back to toLowerCase when _search fields are missing', () => {
    // Products loaded without attachSearchFields (e.g. from legacy path)
    const products = [
      makeProduct({ id: 'p1', name: 'Coca Cola', brand: 'Coca-Cola' }),
      makeProduct({ id: 'p2', name: 'Pepsi', brand: 'PepsiCo' }),
    ];
    // Deliberately NOT calling attachSearchFields
    useProductsStore.setState({ products });

    const results = useProductsStore.getState().searchProducts('coca');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('p1');
  });
});

describe('GCP-STG-0367: cartIdSet O(1) membership check', () => {
  it('Set.has replaces Array.some for cart membership', () => {
    const cartItems = [
      { id: 'item-1', barcode: 'BC001' },
      { id: 'item-2', barcode: 'BC002' },
      { id: 'item-3', barcode: undefined as string | undefined },
    ];

    const cartIdSet = new Set(cartItems.map(c => c.id));
    const cartBarcodeSet = new Set<string>();
    for (const c of cartItems) {
      if (c.barcode) cartBarcodeSet.add(c.barcode);
    }

    // Positive lookups
    expect(cartIdSet.has('item-1')).toBe(true);
    expect(cartIdSet.has('item-3')).toBe(true);
    expect(cartBarcodeSet.has('BC001')).toBe(true);
    expect(cartBarcodeSet.has('BC002')).toBe(true);

    // Negative lookups
    expect(cartIdSet.has('item-99')).toBe(false);
    expect(cartBarcodeSet.has('BC999')).toBe(false);
    expect(cartBarcodeSet.size).toBe(2);
  });

  it('combined id+barcode check matches same logic as .some()', () => {
    const cartItems = [
      { id: 'prod-A', barcode: 'BAR-A' },
      { id: 'prod-B', barcode: 'BAR-B' },
    ];

    const cartIdSet = new Set(cartItems.map(c => c.id));
    const cartBarcodeSet = new Set<string>();
    for (const c of cartItems) { if (c.barcode) cartBarcodeSet.add(c.barcode); }

    // Product matched by ID
    const p1 = { id: 'prod-A', barcode: 'OTHER' };
    const oldWay = cartItems.some(c => c.id === p1.id || c.barcode === p1.barcode);
    const newWay = cartIdSet.has(p1.id) || cartBarcodeSet.has(p1.barcode);
    expect(newWay).toBe(oldWay);

    // Product matched by barcode
    const p2 = { id: 'unknown', barcode: 'BAR-B' };
    expect(cartIdSet.has(p2.id) || cartBarcodeSet.has(p2.barcode))
      .toBe(cartItems.some(c => c.id === p2.id || c.barcode === p2.barcode));

    // Product not in cart
    const p3 = { id: 'nope', barcode: 'nope' };
    expect(cartIdSet.has(p3.id) || cartBarcodeSet.has(p3.barcode))
      .toBe(cartItems.some(c => c.id === p3.id || c.barcode === p3.barcode));
  });
});
