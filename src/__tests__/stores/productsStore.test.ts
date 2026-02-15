/**
 * Tests for productsStore
 * Covers: loadProducts, checkAndRefresh, getProductByBarcode, searchProducts, resetForStore
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn(), getAllKeys: jest.fn() },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(),
}));

const mockListProducts = jest.fn();
const mockGetProductPriceSources = jest.fn();
const mockResolvePriceMinorFromSources = jest.fn();
jest.mock('../../services/api/productsApi', () => ({
  listProducts: (...args: any[]) => mockListProducts(...args),
  getProductPriceSources: (...args: any[]) => mockGetProductPriceSources(...args),
  resolvePriceMinorFromSources: (...args: any[]) => mockResolvePriceMinorFromSources(...args),
}));

const mockCheckCatalogFreshness = jest.fn();
jest.mock('../../services/api/sellSearchApi', () => ({
  checkCatalogFreshness: (...args: any[]) => mockCheckCatalogFreshness(...args),
}));

const mockStoreScopedSetItem = jest.fn().mockResolvedValue(undefined);
const mockStoreScopedGetItem = jest.fn().mockResolvedValue(null);
jest.mock('../../services/storeScope', () => ({
  storeScopedStorage: {
    getItem: (...args: any[]) => mockStoreScopedGetItem(...args),
    setItem: (...args: any[]) => mockStoreScopedSetItem(...args),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockUpsertStockFromProducts = jest.fn();
jest.mock('../../services/stockService', () => ({
  upsertStockFromProducts: (...args: any[]) => mockUpsertStockFromProducts(...args),
}));

const mockEventLoggerLog = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/eventLogger', () => ({
  eventLogger: { log: (...args: any[]) => mockEventLoggerLog(...args) },
}));

import { useProductsStore, Product } from '../../stores/productsStore';

const store = useProductsStore;

beforeEach(() => {
  jest.clearAllMocks();
  store.setState({
    products: [],
    loading: false,
    error: null,
    lastSyncedAt: null,
  });
});

describe('productsStore', () => {
  describe('default state', () => {
    it('has empty products, not loading, no error', () => {
      const s = store.getState();
      expect(s.products).toEqual([]);
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
      expect(s.lastSyncedAt).toBeNull();
    });
  });

  describe('loadProducts', () => {
    it('loads products from backend, caches, and updates stock', async () => {
      const apiProducts = [
        { id: 'p1', name: 'Apple', currency: 'INR', barcode: '111', stock: 10 },
        { id: 'p2', name: 'Banana', currency: 'INR', barcode: null, stock: 5 },
      ];
      mockListProducts.mockResolvedValue(apiProducts);
      mockGetProductPriceSources.mockReturnValue({ inventoryPrice: 100, variantPrice: null, variantMrp: null });
      mockResolvePriceMinorFromSources.mockReturnValue({ priceMinor: 100, inventoryPrice: 100, variantPrice: null, mrp: null });

      await store.getState().loadProducts();

      const s = store.getState();
      expect(s.products).toHaveLength(2);
      expect(s.products[0].id).toBe('p1');
      expect(s.products[0].priceMinor).toBe(100);
      expect(s.products[1].barcode).toBeUndefined();
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
      expect(s.lastSyncedAt).toBeTruthy();
      expect(mockStoreScopedSetItem).toHaveBeenCalled();
      expect(mockUpsertStockFromProducts).toHaveBeenCalledWith(s.products);
      expect(mockEventLoggerLog).toHaveBeenCalledWith('PRODUCTS_LOADED', expect.objectContaining({ count: 2, source: 'backend_api' }));
    });

    it('falls back to cache when backend fails', async () => {
      const cached: Product[] = [{ id: 'c1', name: 'Cached', priceMinor: 50, currency: 'INR' }];
      mockListProducts.mockRejectedValue(new Error('network'));
      mockStoreScopedGetItem.mockResolvedValue(JSON.stringify(cached));

      await store.getState().loadProducts();

      const s = store.getState();
      expect(s.products).toHaveLength(1);
      expect(s.products[0].name).toBe('Cached');
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
      expect(mockEventLoggerLog).toHaveBeenCalledWith('PRODUCTS_LOADED', expect.objectContaining({ source: 'cache' }));
    });

    it('sets error when backend fails and no cache', async () => {
      mockListProducts.mockRejectedValue(new Error('server down'));
      mockStoreScopedGetItem.mockResolvedValue(null);

      await store.getState().loadProducts();

      const s = store.getState();
      expect(s.products).toEqual([]);
      expect(s.error).toBe('server down');
      expect(mockEventLoggerLog).toHaveBeenCalledWith('PRODUCTS_LOAD_FAILED', expect.objectContaining({ error: 'server down' }));
    });

    it('sets error when backend fails and cache is corrupt JSON', async () => {
      mockListProducts.mockRejectedValue(new Error('fail'));
      mockStoreScopedGetItem.mockResolvedValue('not-valid-json');

      await store.getState().loadProducts();

      const s = store.getState();
      expect(s.error).toBe('fail');
    });

    it('sets loading true while fetching', async () => {
      let loadingDuringFetch = false;
      mockListProducts.mockImplementation(() => {
        loadingDuringFetch = store.getState().loading;
        return Promise.resolve([]);
      });
      mockResolvePriceMinorFromSources.mockReturnValue({ priceMinor: 0 });
      mockGetProductPriceSources.mockReturnValue({});

      await store.getState().loadProducts();
      expect(loadingDuringFetch).toBe(true);
      expect(store.getState().loading).toBe(false);
    });
  });

  describe('checkAndRefresh', () => {
    it('refreshes when catalog is stale', async () => {
      mockCheckCatalogFreshness.mockResolvedValue({ stale: true });
      mockListProducts.mockResolvedValue([]);
      mockResolvePriceMinorFromSources.mockReturnValue({ priceMinor: 0 });
      mockGetProductPriceSources.mockReturnValue({});

      await store.getState().checkAndRefresh();

      expect(mockCheckCatalogFreshness).toHaveBeenCalled();
      expect(mockListProducts).toHaveBeenCalled();
    });

    it('does not refresh when catalog is fresh', async () => {
      mockCheckCatalogFreshness.mockResolvedValue({ stale: false });

      await store.getState().checkAndRefresh();

      expect(mockListProducts).not.toHaveBeenCalled();
    });

    it('silently handles freshness check errors', async () => {
      mockCheckCatalogFreshness.mockRejectedValue(new Error('fail'));

      // Should not throw
      await store.getState().checkAndRefresh();
      expect(mockListProducts).not.toHaveBeenCalled();
    });
  });

  describe('getProductByBarcode', () => {
    beforeEach(() => {
      store.setState({
        products: [
          { id: 'p1', name: 'A', priceMinor: 100, currency: 'INR', barcode: 'BC001' },
          { id: 'p2', name: 'B', priceMinor: 200, currency: 'INR', barcode: 'BC002' },
          { id: 'p3', name: 'C', priceMinor: 300, currency: 'INR' },
        ],
      });
    });

    it('finds product by barcode', () => {
      expect(store.getState().getProductByBarcode('BC001')?.id).toBe('p1');
      expect(store.getState().getProductByBarcode('BC002')?.id).toBe('p2');
    });

    it('returns undefined for unknown barcode', () => {
      expect(store.getState().getProductByBarcode('NOPE')).toBeUndefined();
    });

    it('returns undefined for product without barcode', () => {
      expect(store.getState().getProductByBarcode('')).toBeUndefined();
    });
  });

  describe('searchProducts', () => {
    beforeEach(() => {
      store.setState({
        products: [
          { id: 'p1', name: 'Tata Salt', priceMinor: 100, currency: 'INR', barcode: '111', category: 'grocery' },
          { id: 'p2', name: 'Amul Butter', priceMinor: 200, currency: 'INR', barcode: '222', category: 'dairy' },
          { id: 'p3', name: 'Sugar', priceMinor: 300, currency: 'INR' },
        ],
      });
    });

    it('returns all products for empty query', () => {
      expect(store.getState().searchProducts('')).toHaveLength(3);
      expect(store.getState().searchProducts('  ')).toHaveLength(3);
    });

    it('searches by name (case-insensitive)', () => {
      expect(store.getState().searchProducts('salt')).toHaveLength(1);
      expect(store.getState().searchProducts('SALT')).toHaveLength(1);
    });

    it('searches by barcode', () => {
      expect(store.getState().searchProducts('222')).toHaveLength(1);
    });

    it('searches by category', () => {
      expect(store.getState().searchProducts('dairy')).toHaveLength(1);
    });

    it('returns empty for no match', () => {
      expect(store.getState().searchProducts('xyz123')).toHaveLength(0);
    });
  });

  describe('resetForStore', () => {
    it('clears all state', () => {
      store.setState({
        products: [{ id: 'p1', name: 'A', priceMinor: 100, currency: 'INR' }],
        loading: true,
        error: 'some error',
        lastSyncedAt: '2024-01-01',
      });

      store.getState().resetForStore();

      const s = store.getState();
      expect(s.products).toEqual([]);
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
      expect(s.lastSyncedAt).toBeNull();
    });
  });
});
