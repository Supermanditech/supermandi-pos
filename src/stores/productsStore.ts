import { create } from 'zustand';
import { eventLogger } from '../services/eventLogger';
import * as productsApi from '../services/api/productsApi';
import { checkCatalogFreshness } from '../services/api/sellSearchApi';
import { storeScopedStorage } from "../services/storeScope";
import { upsertStockFromProducts } from "../services/stockService";
import { getDeviceToken } from "../services/deviceSession";

const PRODUCTS_CACHE_KEY = 'supermandi.cache.products.v1';

export interface Product {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  barcode?: string;
  category?: string;
  stock?: number;
  description?: string;
}

interface ProductsState {
  products: Product[];
  loading: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  loadProducts: () => Promise<void>;
  checkAndRefresh: () => Promise<void>;
  getProductByBarcode: (barcode: string) => Product | undefined;
  searchProducts: (query: string) => Product[];
  resetForStore: () => void;
}

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  loading: false,
  error: null,
  lastSyncedAt: null,

  loadProducts: async () => {
    // Guard: do not call protected API without a device session
    const token = await getDeviceToken();
    if (!token) {
      return;
    }

    set({ loading: true, error: null });

    try {
      // 1) Try backend first
      const remote = await productsApi.listProducts();
      const productsData: Product[] = remote.map((p) => {
        const priceSources = productsApi.getProductPriceSources(p);
        const resolved = productsApi.resolvePriceMinorFromSources(priceSources);
        return {
          id: p.id,
          name: p.name,
          priceMinor: resolved.priceMinor,
          currency: p.currency,
          barcode: p.barcode ?? undefined,
          stock: p.stock
        };
      });

      await storeScopedStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(productsData));
      upsertStockFromProducts(productsData);

      set({
        products: productsData,
        loading: false,
        error: null,
        lastSyncedAt: new Date().toISOString(),
      });

      await eventLogger.log('PRODUCTS_LOADED', {
        count: productsData.length,
        source: 'backend_api'
      });

    } catch (error) {
      // 2) Fallback to cache
      const cached = await storeScopedStorage.getItem(PRODUCTS_CACHE_KEY);
      if (cached) {
        try {
          const productsData = JSON.parse(cached) as Product[];
          set({ products: productsData, loading: false, error: null });
          upsertStockFromProducts(productsData);
          await eventLogger.log('PRODUCTS_LOADED', {
            count: productsData.length,
            source: 'cache'
          });
          return;
        } catch (parseError) {
          // AUD-064-C FIX: Log cache parse errors for debugging
          console.warn('[ProductsStore] Cache parse error, falling back to bundled data:', parseError);
        }
      }

      // AUDIT-POS-042: Removed hardcoded sample products fallback — show error instead
      // Silent fallback to fake data caused inventory mismatches and false transactions

      const errorMessage = error instanceof Error ? error.message : 'Failed to load products';
      set({
        loading: false,
        error: errorMessage
      });

      await eventLogger.log('PRODUCTS_LOAD_FAILED', {
        error: errorMessage
      });
    }
  },

  // RET-POS-SYNC-010: Check freshness via backend and re-fetch if stale
  checkAndRefresh: async () => {
    // Guard: do not call protected API without a device session
    const token = await getDeviceToken();
    if (!token) return;

    const { lastSyncedAt, loadProducts } = get();
    try {
      const resp = await checkCatalogFreshness(lastSyncedAt);
      if (resp.stale) {
        await loadProducts();
      }
    } catch {
      // Freshness check failures are non-critical
    }
  },

  getProductByBarcode: (barcode: string) => {
    const { products } = get();
    return products.find(product => product.barcode === barcode);
  },

  searchProducts: (query: string) => {
    const { products } = get();
    if (!query.trim()) return products;

    const lowercaseQuery = query.toLowerCase();
    return products.filter(product =>
      product.name.toLowerCase().includes(lowercaseQuery) ||
      (product.barcode ? product.barcode.toLowerCase().includes(lowercaseQuery) : false) ||
      product.category?.toLowerCase().includes(lowercaseQuery)
    );
  },

  resetForStore: () => {
    set({
      products: [],
      loading: false,
      error: null,
      lastSyncedAt: null,
    });
  }
}));

