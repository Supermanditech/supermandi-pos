import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eventLogger } from '../services/eventLogger';
import * as productsApi from '../services/api/productsApi';
import { checkCatalogFreshness, fetchDeltaSync } from '../services/api/sellSearchApi';
import { storeScopedStorage, getStoreScopedKey } from "../services/storeScope";
import { upsertStockFromProducts } from "../services/stockService";
import { getDeviceToken } from "../services/deviceSession";

const PRODUCTS_CACHE_KEY = 'supermandi.cache.products.v1';

// GCP-STG-0366: Chunked AsyncStorage for 10K+ products
// Single JSON blob at 10K products (~5MB) blocks JS thread and risks AsyncStorage limits.
// Chunk into 1000-product blocks with a metadata key for reassembly.
const PRODUCTS_CHUNK_PREFIX = 'supermandi.cache.products.chunk';
const PRODUCTS_META_KEY = 'supermandi.cache.products.meta';
const CHUNK_SIZE = 1000;

interface ChunkMeta {
  chunkCount: number;
  totalProducts: number;
  savedAt: string;
}

/**
 * GCP-STG-0366: Write products in chunks to avoid blocking JS thread on large catalogs.
 * Each chunk stored under a separate key; metadata key tracks chunk count.
 */
export async function writeProductsChunked(products: Product[]): Promise<void> {
  const metaKey = await getStoreScopedKey(PRODUCTS_META_KEY);
  const chunkCount = Math.ceil(products.length / CHUNK_SIZE) || 1;

  // Read old meta BEFORE writing new data — needed for stale chunk cleanup
  const oldMeta = await readChunkMeta();

  // Build key-value pairs for all chunks
  const kvPairs: [string, string][] = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunkKey = await getStoreScopedKey(`${PRODUCTS_CHUNK_PREFIX}_${i}`);
    const slice = products.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    kvPairs.push([chunkKey, JSON.stringify(slice)]);
  }

  const meta: ChunkMeta = {
    chunkCount,
    totalProducts: products.length,
    savedAt: new Date().toISOString(),
  };
  kvPairs.push([metaKey, JSON.stringify(meta)]);

  // Parallel write via AsyncStorage.multiSet
  await AsyncStorage.multiSet(kvPairs);

  // Clean up any leftover chunks from a previous larger catalog
  // (e.g. old catalog had 12 chunks, new one has 8 — remove chunks 8..11)
  if (oldMeta && oldMeta.chunkCount > chunkCount) {
    const staleKeys: string[] = [];
    for (let i = chunkCount; i < oldMeta.chunkCount; i++) {
      staleKeys.push(await getStoreScopedKey(`${PRODUCTS_CHUNK_PREFIX}_${i}`));
    }
    if (staleKeys.length > 0) {
      await AsyncStorage.multiRemove(staleKeys);
    }
  }

  // Clear legacy single-key cache (one-time migration)
  try {
    const legacyKey = await getStoreScopedKey(PRODUCTS_CACHE_KEY);
    await AsyncStorage.removeItem(legacyKey);
  } catch {
    // non-critical
  }
}

/**
 * GCP-STG-0366: Read chunk metadata (null if no chunked cache exists).
 */
async function readChunkMeta(): Promise<ChunkMeta | null> {
  try {
    const metaKey = await getStoreScopedKey(PRODUCTS_META_KEY);
    const raw = await AsyncStorage.getItem(metaKey);
    if (!raw) return null;
    return JSON.parse(raw) as ChunkMeta;
  } catch {
    return null;
  }
}

/**
 * GCP-STG-0366: Read products from chunked cache. Falls back to legacy single-key cache.
 */
export async function readProductsChunked(): Promise<Product[] | null> {
  // Try chunked read first
  const meta = await readChunkMeta();
  if (meta && meta.chunkCount > 0) {
    const chunkKeys: string[] = [];
    for (let i = 0; i < meta.chunkCount; i++) {
      chunkKeys.push(await getStoreScopedKey(`${PRODUCTS_CHUNK_PREFIX}_${i}`));
    }

    const pairs = await AsyncStorage.multiGet(chunkKeys);
    const allProducts: Product[] = [];
    for (const [, value] of pairs) {
      if (value) {
        try {
          const chunk = JSON.parse(value) as Product[];
          allProducts.push(...chunk);
        } catch {
          // Corrupted chunk — abort chunked read
          return null;
        }
      }
    }
    return allProducts;
  }

  // Fallback: legacy single-key cache
  const cached = await storeScopedStorage.getItem(PRODUCTS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as Product[];
    } catch {
      return null;
    }
  }

  return null;
}

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
  // GCP-STG-0410: Expiry date from store_products for SELL detail display
  expiryDate?: string;       // ISO date string from backend (expiry_date column)
  // GCP-STG-0367: Pre-computed lowercase fields for O(1) search (no per-keystroke toLowerCase)
  _searchName?: string;
  _searchBrand?: string;
  _searchBarcode?: string;
  _searchCategory?: string;
  _searchDescription?: string;
}

// GCP-STG-0367: Search result cap — avoids rendering thousands of tiles on broad queries
const SEARCH_RESULT_CAP = 100;

/**
 * GCP-STG-0367: Attach pre-computed lowercase search fields to a product.
 * Called once when products are loaded/synced, not on every keystroke.
 */
export function attachSearchFields(product: Product): Product {
  product._searchName = product.name?.toLowerCase() ?? '';
  product._searchBrand = product.brand?.toLowerCase() ?? '';
  product._searchBarcode = product.barcode?.toLowerCase() ?? '';
  product._searchCategory = product.category?.toLowerCase() ?? '';
  product._searchDescription = product.description?.toLowerCase() ?? '';
  return product;
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
            // GCP-STG-0410: Expiry date for SELL detail display
            expiryDate: raw.expiryDate ?? raw.expiry_date ?? undefined,
          };
        });

        // GCP-STG-0367: Pre-compute lowercase search fields at load time
        mapped.forEach(attachSearchFields);
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

      // GCP-STG-0366: Chunked write to avoid blocking JS thread on 10K+ catalogs
      await writeProductsChunked(allProducts);

      await eventLogger.log('PRODUCTS_LOADED', {
        count: allProducts.length,
        source: 'backend_api'
      });

    } catch (error) {
      // 2) Fallback to cache — GCP-STG-0366: chunked read (with legacy fallback)
      try {
        const productsData = await readProductsChunked();
        if (productsData && productsData.length > 0) {
          // GCP-STG-0367: Pre-compute search fields on cache load
          productsData.forEach(attachSearchFields);
          set({ products: productsData, loading: false, error: null });
          upsertStockFromProducts(productsData);
          await eventLogger.log('PRODUCTS_LOADED', {
            count: productsData.length,
            source: 'cache'
          });
          return;
        }
      } catch (parseError) {
        // AUD-064-C FIX: Log cache parse errors for debugging
        console.warn('[ProductsStore] Cache parse error, falling back to bundled data:', parseError);
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

              // GCP-STG-0367: Pre-compute search fields on delta upsert
              attachSearchFields(mapped);
              byId.set(mapped.id, mapped);
            }

            const merged = Array.from(byId.values());
            const now = new Date().toISOString();
            set({ products: merged, lastSyncedAt: now });

            // Persist merged cache + update stock — GCP-STG-0366: chunked write
            await writeProductsChunked(merged);
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

  // GCP-STG-0367: Pre-computed lowercase fields + capped results + for-loop early break
  // GCP-STG-0093: Multi-parameter search — name, barcode, category, brand, description
  searchProducts: (query: string) => {
    const { products } = get();
    if (!query.trim()) return products;

    const lq = query.toLowerCase();
    const results: Product[] = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (
        (p._searchName ?? p.name.toLowerCase()).includes(lq) ||
        (p._searchBarcode ?? p.barcode?.toLowerCase() ?? '').includes(lq) ||
        (p._searchCategory ?? p.category?.toLowerCase() ?? '').includes(lq) ||
        (p._searchBrand ?? p.brand?.toLowerCase() ?? '').includes(lq) ||
        (p._searchDescription ?? p.description?.toLowerCase() ?? '').includes(lq)
      ) {
        results.push(p);
        if (results.length >= SEARCH_RESULT_CAP) break;
      }
    }
    return results;
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

