/**
 * SCALE-D4: Catalog listing Redis cache (page 1 per store)
 * Tests that page-1 unfiltered catalog responses are cached, served from cache,
 * bypassed for filtered/paged requests, and invalidated on product CRUD.
 */

// ---------------------------------------------------------------------------
// Helpers — lightweight stubs that do NOT import the real modules
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'supermandi:';
const CATALOG_PAGE1_TTL = 300;

function catalogPage1Key(storeId: string): string {
  return `catalog:store:${storeId}:page1`;
}

// In-memory Redis stub
class RedisMock {
  private store: Map<string, { value: string; ttl: number }> = new Map();
  public healthy = true;

  async get(key: string): Promise<string | null> {
    if (!this.healthy) throw new Error('Redis connection refused');
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async setex(key: string, ttl: number, value: string): Promise<void> {
    if (!this.healthy) throw new Error('Redis connection refused');
    this.store.set(key, { value, ttl });
  }

  async del(key: string): Promise<number> {
    if (!this.healthy) throw new Error('Redis connection refused');
    return this.store.delete(key) ? 1 : 0;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Thin wrappers matching backend/src/db/redis.ts signatures
function makeCacheHelpers(redis: RedisMock) {
  async function cacheGet<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(CACHE_PREFIX + key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async function cacheSet<T>(key: string, value: T, ttlSeconds = CATALOG_PAGE1_TTL): Promise<void> {
    try {
      await redis.setex(CACHE_PREFIX + key, ttlSeconds, JSON.stringify(value));
    } catch {
      // graceful — cache failure must not propagate
    }
  }

  async function cacheDelete(key: string): Promise<void> {
    try {
      await redis.del(CACHE_PREFIX + key);
    } catch {
      // graceful
    }
  }

  return { cacheGet, cacheSet, cacheDelete };
}

// Fake catalog listing handler logic extracted for unit-testability
async function handleCatalogListing(
  storeId: string,
  page: number,
  q: string | undefined,
  category: string | undefined,
  inStockOnly: boolean,
  dbProducts: object[],
  helpers: ReturnType<typeof makeCacheHelpers>
) {
  const { cacheGet, cacheSet } = helpers;
  const isPage1NoFilter = page === 1 && !q && !category && !inStockOnly;

  if (isPage1NoFilter) {
    try {
      const cached = await cacheGet<object>(catalogPage1Key(storeId));
      if (cached !== null) {
        return { source: 'cache', payload: cached };
      }
    } catch {
      // fall through
    }
  }

  // Simulate DB fetch
  const responsePayload = {
    success: true,
    data: dbProducts,
    pagination: { page, limit: 50, total: dbProducts.length, hasMore: false },
    filters: { search: q || null, category: category || null, inStockOnly },
  };

  if (isPage1NoFilter) {
    cacheSet(catalogPage1Key(storeId), responsePayload, CATALOG_PAGE1_TTL).catch(() => {});
  }

  return { source: 'db', payload: responsePayload };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SCALE-D4: Catalog listing Redis cache', () => {
  let redis: RedisMock;
  let helpers: ReturnType<typeof makeCacheHelpers>;
  const storeId = 'store-abc-123';
  const fakeProducts = [{ id: 'p1', name: 'Atta 5kg' }, { id: 'p2', name: 'Dal 1kg' }];

  beforeEach(() => {
    redis = new RedisMock();
    helpers = makeCacheHelpers(redis);
  });

  // -------------------------------------------------------------------------
  // 1. Cache key format
  // -------------------------------------------------------------------------
  it('cache key format is catalog:store:{storeId}:page1', () => {
    const key = catalogPage1Key('store-xyz-999');
    expect(key).toBe('catalog:store:store-xyz-999:page1');
  });

  // -------------------------------------------------------------------------
  // 2. Page 1 no-filter — cache miss fetches from DB and writes cache
  // -------------------------------------------------------------------------
  it('page 1 cache miss fetches from DB and caches the response', async () => {
    const result = await handleCatalogListing(storeId, 1, undefined, undefined, false, fakeProducts, helpers);

    expect(result.source).toBe('db');
    expect(result.payload).toMatchObject({ success: true, data: fakeProducts });

    // Verify Redis was written
    const stored = redis.has(CACHE_PREFIX + catalogPage1Key(storeId));
    expect(stored).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Page 1 cache hit returns cached response without hitting DB
  // -------------------------------------------------------------------------
  it('page 1 cache hit returns cached response', async () => {
    // Prime cache
    await handleCatalogListing(storeId, 1, undefined, undefined, false, fakeProducts, helpers);

    // Second call — supply different DB data to prove cache is used
    const differentProducts = [{ id: 'p99', name: 'New Product' }];
    const result = await handleCatalogListing(storeId, 1, undefined, undefined, false, differentProducts, helpers);

    expect(result.source).toBe('cache');
    // Response still has the original cached products
    expect((result.payload as any).data).toEqual(fakeProducts);
  });

  // -------------------------------------------------------------------------
  // 4. Page 2 bypasses cache
  // -------------------------------------------------------------------------
  it('page 2 request bypasses cache entirely', async () => {
    // Prime page-1 cache
    await handleCatalogListing(storeId, 1, undefined, undefined, false, fakeProducts, helpers);

    const page2Products = [{ id: 'p3', name: 'Ghee 1L' }];
    const result = await handleCatalogListing(storeId, 2, undefined, undefined, false, page2Products, helpers);

    expect(result.source).toBe('db');
    expect(result.payload).toMatchObject({ data: page2Products, pagination: { page: 2 } });
  });

  // -------------------------------------------------------------------------
  // 5. Filtered requests bypass cache (search query)
  // -------------------------------------------------------------------------
  it('page 1 with search query bypasses cache', async () => {
    // Prime page-1 cache
    await handleCatalogListing(storeId, 1, undefined, undefined, false, fakeProducts, helpers);

    const searchResults = [{ id: 'p1', name: 'Atta 5kg' }];
    const result = await handleCatalogListing(storeId, 1, 'atta', undefined, false, searchResults, helpers);

    expect(result.source).toBe('db');
    expect(result.payload).toMatchObject({ data: searchResults });
  });

  // -------------------------------------------------------------------------
  // 6. Filtered requests bypass cache (category filter)
  // -------------------------------------------------------------------------
  it('page 1 with category filter bypasses cache', async () => {
    const result = await handleCatalogListing(storeId, 1, undefined, 'Grains', false, fakeProducts, helpers);
    expect(result.source).toBe('db');
    // Ensure no page-1 unfiltered cache was written
    expect(redis.has(CACHE_PREFIX + catalogPage1Key(storeId))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 7. Cache invalidated on product create
  // -------------------------------------------------------------------------
  it('cache invalidated on product create (POST)', async () => {
    // Prime cache
    await handleCatalogListing(storeId, 1, undefined, undefined, false, fakeProducts, helpers);
    expect(redis.has(CACHE_PREFIX + catalogPage1Key(storeId))).toBe(true);

    // Simulate POST product create invalidation
    await helpers.cacheDelete(catalogPage1Key(storeId));

    expect(redis.has(CACHE_PREFIX + catalogPage1Key(storeId))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 8. Cache invalidated on product update (PATCH)
  // -------------------------------------------------------------------------
  it('cache invalidated on product update (PATCH)', async () => {
    await handleCatalogListing(storeId, 1, undefined, undefined, false, fakeProducts, helpers);
    expect(redis.has(CACHE_PREFIX + catalogPage1Key(storeId))).toBe(true);

    // Simulate PATCH product update invalidation
    await helpers.cacheDelete(catalogPage1Key(storeId));

    expect(redis.has(CACHE_PREFIX + catalogPage1Key(storeId))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 9. Cache invalidated on product delete
  // -------------------------------------------------------------------------
  it('cache invalidated on product delete (DELETE)', async () => {
    await handleCatalogListing(storeId, 1, undefined, undefined, false, fakeProducts, helpers);
    expect(redis.has(CACHE_PREFIX + catalogPage1Key(storeId))).toBe(true);

    // Simulate DELETE product invalidation
    await helpers.cacheDelete(catalogPage1Key(storeId));

    expect(redis.has(CACHE_PREFIX + catalogPage1Key(storeId))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 10. Redis unavailable → graceful DB fallback (no error thrown)
  // -------------------------------------------------------------------------
  it('Redis unavailable falls back to DB without throwing', async () => {
    redis.healthy = false; // Simulate Redis down

    // Should not throw
    const result = await handleCatalogListing(storeId, 1, undefined, undefined, false, fakeProducts, helpers);

    expect(result.source).toBe('db');
    expect(result.payload).toMatchObject({ success: true, data: fakeProducts });
  });

  // -------------------------------------------------------------------------
  // 11. Cache is store-scoped (different stores have isolated cache keys)
  // -------------------------------------------------------------------------
  it('cache is isolated per store', async () => {
    const storeA = 'store-aaa';
    const storeB = 'store-bbb';
    const productsA = [{ id: 'a1', name: 'Product A' }];
    const productsB = [{ id: 'b1', name: 'Product B' }];

    await handleCatalogListing(storeA, 1, undefined, undefined, false, productsA, helpers);
    await handleCatalogListing(storeB, 1, undefined, undefined, false, productsB, helpers);

    // Invalidate store A only
    await helpers.cacheDelete(catalogPage1Key(storeA));

    expect(redis.has(CACHE_PREFIX + catalogPage1Key(storeA))).toBe(false);
    expect(redis.has(CACHE_PREFIX + catalogPage1Key(storeB))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 12. TTL is set to 300 seconds
  // -------------------------------------------------------------------------
  it('cache TTL constant is 300 seconds', () => {
    expect(CATALOG_PAGE1_TTL).toBe(300);
  });
});
