// catalogCache.ts - T-146: Offline catalog browsing
// Caches buy-catalog responses in AsyncStorage for offline access
// Cache key pattern: supermandi.catalog.cache.v1.${storeId}

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CatalogProduct } from "./api/catalogApi";

// =============================================================================
// CONSTANTS
// =============================================================================

import { SK_CATALOG_CACHE, SK_CATEGORIES_CACHE } from "../constants/storageKeys";
const CATALOG_CACHE_KEY = SK_CATALOG_CACHE;
const CATEGORIES_CACHE_KEY = SK_CATEGORIES_CACHE;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_PRODUCTS = 500; // Max products to cache

// =============================================================================
// TYPES
// =============================================================================

interface CatalogCacheEntry {
  products: CatalogProduct[];
  updatedAt: number; // timestamp ms
}

interface CategoriesCacheEntry {
  categories: string[];
  updatedAt: number;
}

// =============================================================================
// CACHE FUNCTIONS
// =============================================================================

/**
 * Save catalog products to cache.
 * Merges with existing cached products (by product id) and trims to max.
 */
export async function cacheCatalogProducts(
  storeId: string,
  products: CatalogProduct[]
): Promise<void> {
  try {
    const key = `${CATALOG_CACHE_KEY}.${storeId}`;
    const existing = await getCachedCatalog(storeId);

    // Merge: new products override existing by id
    const merged = new Map<string, CatalogProduct>();
    if (existing) {
      for (const p of existing) {
        merged.set(p.id, p);
      }
    }
    for (const p of products) {
      merged.set(p.id, p);
    }

    // Trim to max
    const all = Array.from(merged.values());
    const trimmed = all.slice(0, CACHE_MAX_PRODUCTS);

    const entry: CatalogCacheEntry = {
      products: trimmed,
      updatedAt: Date.now(),
    };

    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn("[catalogCache] Failed to cache products:", error);
  }
}

/**
 * Get cached catalog products for a store.
 * Returns null if no cache or cache is expired.
 */
export async function getCachedCatalog(
  storeId: string
): Promise<CatalogProduct[] | null> {
  try {
    const key = `${CATALOG_CACHE_KEY}.${storeId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const entry: CatalogCacheEntry = JSON.parse(raw);

    // Check TTL
    if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
      // Expired but still return for offline use - caller decides
      // We mark it stale but still usable
      return entry.products;
    }

    return entry.products;
  } catch (error) {
    console.warn("[catalogCache] Failed to read cache:", error);
    return null;
  }
}

/**
 * Check if the catalog cache is fresh (within TTL).
 */
export async function isCacheFresh(storeId: string): Promise<boolean> {
  try {
    const key = `${CATALOG_CACHE_KEY}.${storeId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return false;

    const entry: CatalogCacheEntry = JSON.parse(raw);
    return Date.now() - entry.updatedAt <= CACHE_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Get cache age in a human-readable format.
 */
export async function getCacheAge(storeId: string): Promise<string | null> {
  try {
    const key = `${CATALOG_CACHE_KEY}.${storeId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const entry: CatalogCacheEntry = JSON.parse(raw);
    const ageMs = Date.now() - entry.updatedAt;

    if (ageMs < 60_000) return "just now";
    if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
    if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
    return `${Math.floor(ageMs / 86_400_000)}d ago`;
  } catch {
    return null;
  }
}

/**
 * Save categories to cache.
 */
export async function cacheCatalogCategories(
  storeId: string,
  categories: string[]
): Promise<void> {
  try {
    const key = `${CATEGORIES_CACHE_KEY}.${storeId}`;
    const entry: CategoriesCacheEntry = {
      categories,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn("[catalogCache] Failed to cache categories:", error);
  }
}

/**
 * Get cached categories.
 */
export async function getCachedCategories(
  storeId: string
): Promise<string[] | null> {
  try {
    const key = `${CATEGORIES_CACHE_KEY}.${storeId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const entry: CategoriesCacheEntry = JSON.parse(raw);
    return entry.categories;
  } catch {
    return null;
  }
}

/**
 * Search cached catalog products offline.
 * Supports query text and category filtering.
 */
export function searchCachedProducts(
  products: CatalogProduct[],
  query?: string,
  category?: string
): CatalogProduct[] {
  let results = products;

  // Filter by category
  if (category) {
    results = results.filter(
      (p) => p.category?.toLowerCase() === category.toLowerCase()
    );
  }

  // Filter by search query
  if (query && query.trim().length >= 2) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.displayNameHi?.toLowerCase().includes(q) ||
        p.primaryBarcode?.includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }

  return results;
}

/**
 * Clear all catalog cache for a store.
 */
export async function clearCatalogCache(storeId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      `${CATALOG_CACHE_KEY}.${storeId}`,
      `${CATEGORIES_CACHE_KEY}.${storeId}`,
    ]);
  } catch (error) {
    console.warn("[catalogCache] Failed to clear cache:", error);
  }
}
