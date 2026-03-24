import { normalizeStoreScope, storeScopedStorage } from "./storeScope";

import { SK_STOCK_CACHE } from "../constants/storageKeys";
const STOCK_CACHE_KEY = SK_STOCK_CACHE;
// GL-CRIT-0013: Reduced TTL to 5 minutes to prevent showing stale stock
// Previous 6h TTL caused issues where sold-out items still showed as available.
// Offline safety is maintained by allowing cart operations when stock is unknown (null).
const STOCK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
// ISSUE-204: Duration to protect a manually-edited cache entry from background refresh overwrites
const STOCK_CACHE_PIN_MS = 60 * 1000; // 60 seconds

type StockCacheEntry = {
  stock: number;
  updatedAt: number;
  // ISSUE-204: If set, background refresh must not overwrite this entry until epoch ms has passed
  protectedUntil?: number;
};

type StockCacheState = {
  loaded: boolean;
  entries: Record<string, StockCacheEntry>;
};

const cacheByScope = new Map<string, StockCacheState>();
let activeScope = normalizeStoreScope(null);

// STG-511: Barcode → productId alias map for multi-barcode products
// When a product has multiple barcodes, all should resolve to the same stock entry
const barcodeToProductId = new Map<string, string>();

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
  // STG-511: Resolve barcode alias to product ID for multi-barcode products
  const resolvedKey = barcodeToProductId.get(key) ?? key;
  const entry = state.entries[resolvedKey] ?? state.entries[key];
  if (!entry) return null;
  if (!Number.isFinite(entry.stock)) return null;
  if (!Number.isFinite(entry.updatedAt)) return null;
  if (Date.now() - entry.updatedAt > STOCK_CACHE_TTL_MS) return null;
  return Math.max(0, Math.floor(entry.stock));
}

// BLK-SP1: Check if a specific cache entry is pin-protected (manual edit in progress).
// Used by sync code to distinguish "server-cached stock" from "user-edited stock".
// Only pin-protected entries should block server stock updates to the local SQLite DB.
export function isEntryPinProtected(key: string): boolean {
  const state = getState();
  if (!state.loaded) return false;
  const trimmed = key?.trim();
  if (!trimmed) return false;
  const entry = state.entries[trimmed];
  if (!entry?.protectedUntil) return false;
  return Date.now() < entry.protectedUntil;
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

/**
 * STG-511: Register barcode → productId alias so all barcodes resolve to same stock
 */
export function registerBarcodeAlias(barcode: string, productId: string): void {
  const b = barcode?.trim();
  const p = productId?.trim();
  if (b && p && b !== p) {
    barcodeToProductId.set(b, p);
  }
}

export function updateStockCacheEntries(
  entries: Array<{ key: string; stock: number }>,
  opts?: { pin?: boolean }
): void {
  const state = getState();
  const now = Date.now();
  let changed = false;

  for (const entry of entries) {
    const key = entry.key?.trim();
    if (!key) continue;
    const normalized = normalizeStock(entry.stock);
    if (normalized === null) continue;

    // ISSUE-204: Skip background-refresh writes if the entry is pin-protected
    if (!opts?.pin) {
      const existing = state.entries[key];
      if (existing?.protectedUntil && now < existing.protectedUntil) continue;
    }

    const protectedUntil = opts?.pin ? now + STOCK_CACHE_PIN_MS : undefined;
    state.entries[key] = { stock: normalized, updatedAt: now, protectedUntil };
    changed = true;
  }

  if (!state.loaded) {
    state.loaded = true;
  }

  if (changed) {
    void persistState(state);
  }
}
