import * as productsApi from "./api/productsApi";
import { getStock, getStockBatch } from "./api/inventoryApi";
import { getCachedStock, updateStockCacheEntries, hasStaleEntries, STOCK_TTL_MS } from "./stockCache";
import { isOnline } from "./networkStatus";

type StockEntry = { key: string; stock: number };
type StockProduct = { id: string; barcode?: string | null; stock?: number | null };
type StockKeys = { primary?: string | null; secondary?: string | null };

type StockListener = () => void;

const normalizeKey = (value?: string | null): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
};

const stockListeners = new Set<StockListener>();
let stockVersion = 0;

const notifyStockUpdated = (): void => {
  stockVersion += 1;
  for (const listener of stockListeners) {
    listener();
  }
};

const buildStockEntriesFromProducts = (products: StockProduct[]): StockEntry[] => {
  const entries: StockEntry[] = [];
  for (const product of products) {
    const stock = typeof product.stock === "number" && Number.isFinite(product.stock)
      ? Math.max(0, Math.floor(product.stock))
      : null;
    if (stock === null) continue;
    const idKey = normalizeKey(product.id);
    if (idKey) {
      entries.push({ key: idKey, stock });
    }
    const barcodeKey = normalizeKey(product.barcode ?? null);
    if (barcodeKey) {
      entries.push({ key: barcodeKey, stock });
    }
  }
  return entries;
};

export function upsertStockEntries(entries: StockEntry[]): void {
  if (!entries.length) return;
  updateStockCacheEntries(entries);
  notifyStockUpdated();
}

export function upsertStockFromProducts(products: StockProduct[]): void {
  upsertStockEntries(buildStockEntriesFromProducts(products));
}

export function resolveStockForKeys(keys: StockKeys): number | null {
  const primary = normalizeKey(keys.primary);
  if (primary) {
    const cached = getCachedStock(primary);
    if (cached !== null) return cached;
  }
  const secondary = normalizeKey(keys.secondary);
  if (secondary) {
    const cached = getCachedStock(secondary);
    if (cached !== null) return cached;
  }
  return null;
}

export function resolveStockForCartItem(item: { id?: string | null; barcode?: string | null }): number | null {
  return resolveStockForKeys({ primary: item.barcode ?? null, secondary: item.id ?? null });
}

export function resolveStockForSku(item: { productId?: string | null; barcode?: string | null }): number | null {
  return resolveStockForKeys({ primary: item.productId ?? null, secondary: item.barcode ?? null });
}

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshStockSnapshot(params?: { query?: string }): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      if (!(await isOnline())) return false;
      const products = await productsApi.listProducts(params?.query ? { q: params.query } : undefined);
      upsertStockFromProducts(products);
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export function subscribeStockUpdates(listener: StockListener): () => void {
  stockListeners.add(listener);
  return () => {
    stockListeners.delete(listener);
  };
}

export function getStockVersion(): number {
  return stockVersion;
}

// =============================================================================
// INVENTORY API INTEGRATION (V3.0.9)
// =============================================================================

/**
 * Get real-time stock for a single product from inventory service.
 * Updates the local cache and notifies listeners.
 */
export async function getRealTimeStock(productId: string): Promise<number> {
  try {
    if (!(await isOnline())) {
      // Return cached value when offline
      return getCachedStock(productId) ?? 0;
    }

    const result = await getStock(productId);
    const stock = result.currentQty;

    // Update cache
    upsertStockEntries([{ key: productId, stock }]);

    return stock;
  } catch (error) {
    console.warn(`[Stock] Failed to get real-time stock for ${productId}:`, error);
    // Return cached value on error
    return getCachedStock(productId) ?? 0;
  }
}

/**
 * Get real-time stock for multiple products from inventory service.
 * More efficient than individual lookups.
 */
export async function getRealTimeStockBatch(
  productIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (productIds.length === 0) {
    return result;
  }

  try {
    if (!(await isOnline())) {
      // Return cached values when offline
      for (const productId of productIds) {
        result.set(productId, getCachedStock(productId) ?? 0);
      }
      return result;
    }

    const stockBatch = await getStockBatch(productIds);
    const entries: StockEntry[] = [];

    for (const productId of productIds) {
      const stockData = stockBatch[productId];
      const stock = stockData?.currentQty ?? 0;
      result.set(productId, stock);
      entries.push({ key: productId, stock });
    }

    // Update cache
    upsertStockEntries(entries);

    return result;
  } catch (error) {
    console.warn(`[Stock] Failed to get real-time stock batch:`, error);
    // Return cached values on error
    for (const productId of productIds) {
      result.set(productId, getCachedStock(productId) ?? 0);
    }
    return result;
  }
}

/**
 * Refresh stock from inventory service for cart items.
 * Used to get accurate stock before checkout.
 */
export async function refreshCartStock(
  items: Array<{ id: string; barcode?: string | null }>
): Promise<boolean> {
  try {
    const productIds = items.map((item) => item.id).filter(Boolean);
    if (productIds.length === 0) return true;

    await getRealTimeStockBatch(productIds);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// GL-CRIT-0013: PERIODIC STOCK REFRESH
// =============================================================================

let autoRefreshInterval: ReturnType<typeof setInterval> | null = null;

/**
 * GL-CRIT-0013: Start periodic stock cache refresh
 * Automatically refreshes stock every 5 minutes when online
 */
export function startStockAutoRefresh(): void {
  if (autoRefreshInterval) return; // Already running

  // Check and refresh every 2 minutes (half the TTL) if cache has stale entries
  autoRefreshInterval = setInterval(async () => {
    try {
      if (!(await isOnline())) return;
      if (hasStaleEntries()) {
        console.log("[Stock] GL-CRIT-0013: Auto-refreshing stale stock entries");
        await refreshStockSnapshot();
      }
    } catch (error) {
      console.warn("[Stock] Auto-refresh failed:", error);
    }
  }, Math.floor(STOCK_TTL_MS / 2.5)); // Check at ~2 minutes

  console.log("[Stock] GL-CRIT-0013: Auto-refresh started");
}

/**
 * GL-CRIT-0013: Stop periodic stock cache refresh
 */
export function stopStockAutoRefresh(): void {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    console.log("[Stock] GL-CRIT-0013: Auto-refresh stopped");
  }
}

/**
 * GL-CRIT-0013: Check if stock cache needs refresh (has stale entries)
 */
export function needsStockRefresh(): boolean {
  return hasStaleEntries();
}
