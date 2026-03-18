import { create } from 'zustand';
import { eventLogger } from '../services/eventLogger';
import * as productsApi from '../services/api/productsApi';
import { checkCatalogFreshness } from '../services/api/sellSearchApi';
import { storeScopedStorage } from "../services/storeScope";
import { upsertStockFromProducts } from "../services/stockService";
import { getDeviceToken } from "../services/deviceSession";

const PRODUCTS_CACHE_KEY = 'supermandi.cache.products.v1';

// V3-FIX-096: Authoritative product contract — preserves all metadata from backend
export interface Product {
  id: string;
  storeProductId?: string;
  name: string;
  priceMinor: number;        // sell price in minor units
  mrpMinor?: number;         // MRP in minor units
  purchasePriceMinor?: number;
  currency: string;
  barcode?: string;
  category?: string;
  stock?: number;
  description?: string;
  brand?: string;
  imageUrl?: string;
  unit?: string;
  hsnCode?: string;
  gstRate?: number;
  netContentValue?: number;
  netContentUnit?: string;
  supplierId?: string;
  supplierName?: string;
  metadataUpdatedAt?: string;
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
      // V3-FIX-096: Preserve all product metadata from backend
      const productsData: Product[] = remote.map((p) => {
        const priceSources = productsApi.getProductPriceSources(p);
        const resolved = productsApi.resolvePriceMinorFromSources(priceSources);
        const raw = p as any;
        return {
          id: p.id,
          storeProductId: raw.storeProductId ?? raw.store_product_id,
          name: p.name,
          priceMinor: resolved.priceMinor,
          mrpMinor: raw.mrpMinor ?? raw.mrp_minor ?? (raw.mrp ? Math.round(raw.mrp * 100) : undefined),
          purchasePriceMinor: raw.purchasePriceMinor ?? raw.purchase_price_minor,
          currency: p.currency,
          barcode: p.barcode ?? undefined,
          category: raw.category ?? raw.categoryName,
          stock: p.stock,
          description: raw.description,
          brand: raw.brand,
          imageUrl: raw.imageUrl ?? raw.image_url,
          unit: raw.unit,
          hsnCode: raw.hsnCode ?? raw.hsn_code,
          gstRate: raw.gstRate ?? raw.gst_rate,
          netContentValue: raw.netContentValue ?? raw.net_content_value,
          netContentUnit: raw.netContentUnit ?? raw.net_content_unit,
          supplierId: raw.supplierId ?? raw.supplier_id,
          supplierName: raw.supplierName ?? raw.supplier_name,
          metadataUpdatedAt: raw.metadataUpdatedAt ?? raw.metadata_updated_at,
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

  // V3-FIX-160: Barcode lookup with explicit precedence:
  // 1. Store override barcode (exact match on barcode field)
  // 2. Manufacturer barcode (exact match on barcode field — same column, different origin)
  // 3. Product ID as barcode fallback (for generated SM- labels)
  getProductByBarcode: (barcode: string) => {
    const { products } = get();
    // Primary: exact barcode match (covers both store override and manufacturer)
    const byBarcode = products.find(product => product.barcode === barcode);
    if (byBarcode) return byBarcode;
    // Fallback: generated label barcode (SM- prefix or product ID)
    return products.find(product => product.id === barcode) ?? undefined;
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

