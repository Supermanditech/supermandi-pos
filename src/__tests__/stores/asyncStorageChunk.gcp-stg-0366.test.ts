/**
 * GCP-STG-0366: Chunked AsyncStorage for 10K+ product cache
 *
 * Tests writeProductsChunked and readProductsChunked:
 * - Small catalog (< 1000): 1 chunk + meta
 * - Large catalog (2500): 3 chunks + meta
 * - Empty catalog: 1 empty chunk + meta
 * - Legacy fallback: readProductsChunked reads old single-key cache
 * - Stale chunk cleanup: shrinking catalog removes leftover chunks
 * - Corrupted chunk returns null
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
    _store: store,
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

// Mock deviceSession to return a fixed storeId for scoping
jest.mock('../../services/deviceSession', () => ({
  getDeviceStoreId: jest.fn().mockResolvedValue('TEST-STORE-001'),
  getDeviceToken: jest.fn().mockResolvedValue('test-token'),
}));

// Mock eventLogger
jest.mock('../../services/eventLogger', () => ({
  eventLogger: { log: jest.fn() },
}));

// Mock stockService
jest.mock('../../services/stockService', () => ({
  upsertStockFromProducts: jest.fn(),
}));

// Mock productsApi (imported by productsStore)
jest.mock('../../services/api/productsApi', () => ({
  listProductsProgressive: jest.fn(),
  getProductPriceSources: jest.fn(),
  resolvePriceMinorFromSources: jest.fn(),
}));

// Mock sellSearchApi
jest.mock('../../services/api/sellSearchApi', () => ({
  checkCatalogFreshness: jest.fn(),
  fetchDeltaSync: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { writeProductsChunked, readProductsChunked, Product } from '../../stores/productsStore';
import { buildStoreScopedKey } from '../../services/storeScope';

// Helper: access the mock store directly
function getMockStore(): Record<string, string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('@react-native-async-storage/async-storage') as any)._store;
}

function clearMockStore(): void {
  const store = getMockStore();
  for (const k of Object.keys(store)) delete store[k];
}

function makeProduct(index: number): Product {
  return {
    id: `prod-${index}`,
    name: `Product ${index}`,
    priceMinor: index * 100,
    currency: 'INR',
    barcode: `BAR${index}`,
  };
}

function makeProducts(count: number): Product[] {
  return Array.from({ length: count }, (_, i) => makeProduct(i));
}

const SCOPE = 'TEST-STORE-001';

describe('GCP-STG-0366: Chunked AsyncStorage', () => {
  beforeEach(() => {
    clearMockStore();
    jest.clearAllMocks();
  });

  it('writes small catalog (<1000) as 1 chunk + meta', async () => {
    const products = makeProducts(50);
    await writeProductsChunked(products);

    const store = getMockStore();
    const metaKey = buildStoreScopedKey('supermandi.cache.products.meta', SCOPE);
    const chunk0Key = buildStoreScopedKey('supermandi.cache.products.chunk_0', SCOPE);

    expect(store[metaKey]).toBeDefined();
    const meta = JSON.parse(store[metaKey]);
    expect(meta.chunkCount).toBe(1);
    expect(meta.totalProducts).toBe(50);
    expect(meta.savedAt).toBeTruthy();

    expect(store[chunk0Key]).toBeDefined();
    const chunk0 = JSON.parse(store[chunk0Key]);
    expect(chunk0).toHaveLength(50);
    expect(chunk0[0].id).toBe('prod-0');
    expect(chunk0[49].id).toBe('prod-49');
  });

  it('writes large catalog (2500) as 3 chunks', async () => {
    const products = makeProducts(2500);
    await writeProductsChunked(products);

    const store = getMockStore();
    const metaKey = buildStoreScopedKey('supermandi.cache.products.meta', SCOPE);
    const meta = JSON.parse(store[metaKey]);
    expect(meta.chunkCount).toBe(3);
    expect(meta.totalProducts).toBe(2500);

    // Chunk 0: 1000, Chunk 1: 1000, Chunk 2: 500
    const c0 = JSON.parse(store[buildStoreScopedKey('supermandi.cache.products.chunk_0', SCOPE)]);
    const c1 = JSON.parse(store[buildStoreScopedKey('supermandi.cache.products.chunk_1', SCOPE)]);
    const c2 = JSON.parse(store[buildStoreScopedKey('supermandi.cache.products.chunk_2', SCOPE)]);
    expect(c0).toHaveLength(1000);
    expect(c1).toHaveLength(1000);
    expect(c2).toHaveLength(500);
  });

  it('writes empty catalog as 1 empty chunk', async () => {
    await writeProductsChunked([]);

    const store = getMockStore();
    const metaKey = buildStoreScopedKey('supermandi.cache.products.meta', SCOPE);
    const meta = JSON.parse(store[metaKey]);
    expect(meta.chunkCount).toBe(1);
    expect(meta.totalProducts).toBe(0);

    const c0 = JSON.parse(store[buildStoreScopedKey('supermandi.cache.products.chunk_0', SCOPE)]);
    expect(c0).toHaveLength(0);
  });

  it('readProductsChunked reassembles chunks correctly', async () => {
    const products = makeProducts(2500);
    await writeProductsChunked(products);

    const result = await readProductsChunked();
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(2500);
    expect(result![0].id).toBe('prod-0');
    expect(result![999].id).toBe('prod-999');
    expect(result![1000].id).toBe('prod-1000');
    expect(result![2499].id).toBe('prod-2499');
  });

  it('readProductsChunked falls back to legacy single-key cache', async () => {
    // No chunked data — write legacy key
    const legacyKey = buildStoreScopedKey('supermandi.cache.products.v1', SCOPE);
    const products = makeProducts(5);
    getMockStore()[legacyKey] = JSON.stringify(products);

    const result = await readProductsChunked();
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(5);
    expect(result![0].id).toBe('prod-0');
  });

  it('readProductsChunked returns null when no cache exists', async () => {
    const result = await readProductsChunked();
    expect(result).toBeNull();
  });

  it('cleans up stale chunks when catalog shrinks', async () => {
    // Write 3000 products (3 chunks)
    await writeProductsChunked(makeProducts(3000));

    const store = getMockStore();
    const chunk2Key = buildStoreScopedKey('supermandi.cache.products.chunk_2', SCOPE);
    expect(store[chunk2Key]).toBeDefined();

    // Now write 500 products (1 chunk) — chunk_1, chunk_2 should be removed
    await writeProductsChunked(makeProducts(500));

    expect(store[chunk2Key]).toBeUndefined();
    const chunk1Key = buildStoreScopedKey('supermandi.cache.products.chunk_1', SCOPE);
    expect(store[chunk1Key]).toBeUndefined();

    // Meta should reflect new state
    const metaKey = buildStoreScopedKey('supermandi.cache.products.meta', SCOPE);
    const meta = JSON.parse(store[metaKey]);
    expect(meta.chunkCount).toBe(1);
    expect(meta.totalProducts).toBe(500);
  });

  it('clears legacy single-key cache on chunked write', async () => {
    const legacyKey = buildStoreScopedKey('supermandi.cache.products.v1', SCOPE);
    getMockStore()[legacyKey] = JSON.stringify(makeProducts(10));

    await writeProductsChunked(makeProducts(100));

    expect(getMockStore()[legacyKey]).toBeUndefined();
  });

  it('returns null on corrupted chunk data', async () => {
    // Write valid meta but corrupt a chunk
    await writeProductsChunked(makeProducts(2000));

    const chunk1Key = buildStoreScopedKey('supermandi.cache.products.chunk_1', SCOPE);
    getMockStore()[chunk1Key] = 'NOT_VALID_JSON{{{';

    const result = await readProductsChunked();
    expect(result).toBeNull();
  });

  it('uses multiSet for parallel writes (not individual setItem calls)', async () => {
    await writeProductsChunked(makeProducts(2500));

    // multiSet should have been called (at least once for the batch)
    expect(AsyncStorage.multiSet).toHaveBeenCalled();
  });

  it('uses multiGet for parallel reads', async () => {
    await writeProductsChunked(makeProducts(2500));
    jest.clearAllMocks();

    await readProductsChunked();

    expect(AsyncStorage.multiGet).toHaveBeenCalled();
    // Should request exactly 3 chunk keys
    const call = (AsyncStorage.multiGet as jest.Mock).mock.calls[0];
    expect(call[0]).toHaveLength(3);
  });
});
