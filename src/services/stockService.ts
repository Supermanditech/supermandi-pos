import * as productsApi from "./api/productsApi";
import { getCachedStock, updateStockCacheEntries } from "./stockCache";
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
