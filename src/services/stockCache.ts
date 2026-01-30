import { normalizeStoreScope, storeScopedStorage } from "./storeScope";

const STOCK_CACHE_KEY = "supermandi.stock.cache.v1";
// GL-CRIT-0013: Reduced TTL to 5 minutes to prevent showing stale stock
// Previous 6h TTL caused issues where sold-out items still showed as available.
// Offline safety is maintained by allowing cart operations when stock is unknown (null).
const STOCK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type StockCacheEntry = {
  stock: number;
  updatedAt: number;
};

type StockCacheState = {
  loaded: boolean;
  entries: Record<string, StockCacheEntry>;
};

const cacheByScope = new Map<string, StockCacheState>();
let activeScope = normalizeStoreScope(null);

const getState = (scope = activeScope): StockCacheState => {
  const existing = cacheByScope.get(scope);
  if (existing) return existing;
  const created = { loaded: false, entries: {} };
  cacheByScope.set(scope, created);
  return created;
};

const normalizeStock = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};

const persistState = async (state: StockCacheState): Promise<void> => {
  try {
    await storeScopedStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(state.entries));
  } catch (persistError) {
    // GO-LIVE-168: Log persistence failures but don't block runtime flow
    const errorMsg = persistError instanceof Error ? persistError.message : String(persistError);
    console.warn(`[GO-LIVE-168] stockCache persistState failed: ${errorMsg}`);
  }
};

export function setStockCacheStoreId(storeId?: string | null): void {
  activeScope = normalizeStoreScope(storeId ?? null);
  getState(activeScope);
}

export async function hydrateStockCacheForStore(storeId?: string | null): Promise<void> {
  const scope = normalizeStoreScope(storeId ?? null);
  const state = getState(scope);
  if (state.loaded) return;

  try {
    const raw = await storeScopedStorage.getItem(STOCK_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, StockCacheEntry>;
      state.entries = parsed ?? {};
    }
  } catch (hydrateError) {
    // GO-LIVE-168: Log hydration errors instead of silently discarding
    const errorMsg = hydrateError instanceof Error ? hydrateError.message : String(hydrateError);
    console.error(`[GO-LIVE-168] stockCache hydration failed: ${errorMsg}`);
    state.entries = {};
  }

  state.loaded = true;
}

export function getCachedStock(key: string): number | null {
  const state = getState();
  if (!state.loaded) return null;
  const entry = state.entries[key];
  if (!entry) return null;
  if (!Number.isFinite(entry.stock)) return null;
  if (!Number.isFinite(entry.updatedAt)) return null;
  if (Date.now() - entry.updatedAt > STOCK_CACHE_TTL_MS) return null;
  return Math.max(0, Math.floor(entry.stock));
}

// GL-CRIT-0013: Check if any cache entries are stale (for triggering refresh)
export function hasStaleEntries(): boolean {
  const state = getState();
  if (!state.loaded) return false;
  const now = Date.now();
  for (const entry of Object.values(state.entries)) {
    if (now - entry.updatedAt > STOCK_CACHE_TTL_MS) {
      return true;
    }
  }
  return false;
}

// GL-CRIT-0013: Get the age of the oldest cache entry
export function getOldestEntryAge(): number | null {
  const state = getState();
  if (!state.loaded) return null;
  const entries = Object.values(state.entries);
  if (entries.length === 0) return null;
  const oldest = Math.min(...entries.map(e => e.updatedAt));
  return Date.now() - oldest;
}

// GL-CRIT-0013: Export TTL for use in refresh logic
export const STOCK_TTL_MS = STOCK_CACHE_TTL_MS;

export function updateStockCacheEntries(entries: Array<{ key: string; stock: number }>): void {
  const state = getState();
  const now = Date.now();
  let changed = false;

  for (const entry of entries) {
    const key = entry.key?.trim();
    if (!key) continue;
    const normalized = normalizeStock(entry.stock);
    if (normalized === null) continue;
    state.entries[key] = { stock: normalized, updatedAt: now };
    changed = true;
  }

  if (!state.loaded) {
    state.loaded = true;
  }

  if (changed) {
    void persistState(state);
  }
}
