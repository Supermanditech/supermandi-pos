import { normalizeStoreScope, storeScopedStorage } from "./storeScope";

const STOCK_CACHE_KEY = "supermandi.stock.cache.v1";
const STOCK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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
  } catch {
    // Cache persistence failures should not block runtime flow.
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
  } catch {
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
