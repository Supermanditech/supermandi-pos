import { create } from 'zustand';
import { eventLogger } from '../services/eventLogger';
import * as productsApi from '../services/api/productsApi';
import { checkCatalogFreshness, fetchDeltaSync } from '../services/api/sellSearchApi';
import { storeScopedStorage } from "../services/storeScope";
import { upsertStockFromProducts } from "../services/stockService";
import { getDeviceToken } from "../services/deviceSession";

const PRODUCTS_CACHE_KEY = 'supermandi.cache.products.v1';

// V3-FIX-096: Authoritative product contract — preserves all metadata from backend
// V3-FIX-167: Added canonical conversion profile fields
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
  // V3-FIX-167: Canonical procurement-to-retail conversion profile
  productMode?: 'PACKAGED' | 'LOOSE_BULK';
  soldBy?: 'WEIGHT' | 'COUNT';
  rateUnit?: string;
  procurementUnit?: string;
  procurementPackQty?: number;
  baseStockUnit?: string;
  allowFractionalSell?: boolean;
  conversionPrecision?: number;
  conversionConfirmed?: boolean;
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
      // GCP-STG-0083: Progressive loading — update store after each 500-item chunk
      // First chunk renders immediately, rest loads in background
      const allProducts: Product[] = [];

      await productsApi.listProductsProgressive((pageItems, done) => {
        // V3-FIX-096: Preserve all product metadata from backend
        const mapped: Product[] = pageItems.map((p) => {
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
            // V3-FIX-167: Canonical conversion profile
            productMode: raw.productMode ?? raw.product_mode ?? raw.mode ?? undefined,
            soldBy: raw.soldBy ?? raw.sold_by ?? undefined,
            rateUnit: raw.rateUnit ?? raw.rate_unit ?? undefined,
            procurementUnit: raw.procurementUnit ?? raw.procurement_unit ?? undefined,
            procurementPackQty: raw.procurementPackQty ?? raw.procurement_pack_qty ?? undefined,
            baseStockUnit: raw.baseStockUnit ?? raw.base_stock_unit ?? undefined,
            allowFractionalSell: raw.allowFractionalSell ?? raw.allow_fractional_sell ?? undefined,
            conversionPrecision: raw.conversionPrecision ?? raw.conversion_precision ?? undefined,
            conversionConfirmed: raw.conversionConfirmed ?? raw.conversion_confirmed ?? undefined,
          };
        });

        allProducts.push(...mapped);

        // GCP-STG-0083: Update store incrementally — first chunk visible immediately
        set({
          products: [...allProducts],
          loading: !done,
          error: null,
          ...(done ? { lastSyncedAt: new Date().toISOString() } : {}),
        });

        if (mapped.length > 0) {
          upsertStockFromProducts(mapped);
        }
      });

      await storeScopedStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(allProducts));

      await eventLogger.log('PRODUCTS_LOADED', {
        count: allProducts.length,
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
  // GCP-STG-0336: Try delta sync first, fall back to full reload
  checkAndRefresh: async () => {
    // Guard: do not call protected API without a device session
    const token = await getDeviceToken();
    if (!token) return;

    const { lastSyncedAt, products, loadProducts } = get();
    try {
      const resp = await checkCatalogFreshness(lastSyncedAt);
      if (!resp.stale) return;

      // GCP-STG-0336: Attempt delta sync if we have a lastSyncedAt timestamp
      if (lastSyncedAt) {
        try {
          const delta = await fetchDeltaSync(lastSyncedAt);

          if (!delta.fullReloadRequired && delta.upserted && delta.deletedIds) {
            // Merge delta into local store
            const deletedSet = new Set(delta.deletedIds);
            // Remove deleted products, then update/add upserted ones
            const existing = products.filter(p => !deletedSet.has(p.id));

            // Build map of existing products by id for fast lookup
            const byId = new Map(existing.map(p => [p.id, p]));

            // Apply upserts
            for (const item of delta.upserted) {
              const raw = item as any;
              const priceSources = {
                inventoryPrice: raw.sellPrice ?? null,
                variantPrice: null,
                variantMrp: raw.mrp ?? null,
              };
              const priceMinor = priceSources.inventoryPrice ?? priceSources.variantMrp ?? 0;

              const mapped: Product = {
                id: raw.productId,
                storeProductId: raw.storeProductId ?? raw.store_product_id,
                name: raw.name,
                priceMinor: typeof priceMinor === 'number' && Number.isFinite(priceMinor) ? Math.max(0, priceMinor) : 0,
                mrpMinor: raw.mrp != null ? Math.round(raw.mrp * 100) : undefined,
                purchasePriceMinor: raw.purchasePrice ?? raw.purchasePriceMinor ?? raw.purchase_price_minor,
                currency: 'INR',
                barcode: raw.barcode ?? undefined,
                category: raw.category,
                stock: typeof raw.currentStock === 'number' ? raw.currentStock : 0,
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
                productMode: raw.productMode ?? raw.product_mode ?? raw.mode ?? undefined,
                soldBy: raw.soldBy ?? raw.sold_by ?? undefined,
                rateUnit: raw.rateUnit ?? raw.rate_unit ?? undefined,
                procurementUnit: raw.procurementUnit ?? raw.procurement_unit ?? undefined,
                procurementPackQty: raw.procurementPackQty ?? raw.procurement_pack_qty ?? undefined,
                baseStockUnit: raw.baseStockUnit ?? raw.base_stock_unit ?? undefined,
                allowFractionalSell: raw.allowFractionalSell ?? raw.allow_fractional_sell ?? undefined,
                conversionPrecision: raw.conversionPrecision ?? raw.conversion_precision ?? undefined,
                conversionConfirmed: raw.conversionConfirmed ?? raw.conversion_confirmed ?? undefined,
              };

              byId.set(mapped.id, mapped);
            }

            const merged = Array.from(byId.values());
            const now = new Date().toISOString();
            set({ products: merged, lastSyncedAt: now });

            // Persist merged cache + update stock
            await storeScopedStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(merged));
            upsertStockFromProducts(merged);

            await eventLogger.log('PRODUCTS_DELTA_SYNCED', {
              upserted: delta.upserted.length,
              deleted: delta.deletedIds.length,
              totalAfter: merged.length,
            });
            return; // Delta sync succeeded, no full reload needed
          }
        } catch {
          // Delta sync failed — fall through to full reload
        }
      }

      // Full reload fallback (no lastSyncedAt, or delta returned fullReloadRequired, or delta failed)
      await loadProducts();
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
    // GCP-STG-0093: Multi-parameter search — name, barcode, category, brand, description
    return products.filter(product =>
      product.name.toLowerCase().includes(lowercaseQuery) ||
      (product.barcode ? product.barcode.toLowerCase().includes(lowercaseQuery) : false) ||
      product.category?.toLowerCase().includes(lowercaseQuery) ||
      (product as any).brand?.toLowerCase().includes(lowercaseQuery) ||
      (product as any).description?.toLowerCase().includes(lowercaseQuery)
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

