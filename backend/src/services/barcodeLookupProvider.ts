/**
 * External Barcode Lookup Provider
 * SD-ONBOARD-001B: Provides product prefill data from external barcode databases
 *
 * Supports multiple providers with fallback:
 * 1. Open Food Facts (free, open database)
 * 2. UPC Database API (if configured)
 *
 * Caching: 24h in-memory cache to reduce API calls
 */

// Configuration from environment
const BARCODE_LOOKUP_ENABLED = process.env.BARCODE_LOOKUP_ENABLED !== "false";
const UPC_DATABASE_API_KEY = process.env.UPC_DATABASE_API_KEY;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// GO-LIVE-190: Maximum cache size to prevent memory leak
const MAX_CACHE_SIZE = 10000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface BarcodeProductPrefill {
  barcode: string;
  name: string;
  brand: string;
  description: string;
  unit: string;
  imageUrl: string;
  category: string;
}

interface CacheEntry {
  data: BarcodeProductPrefill | null;
  timestamp: number;
}

// Simple in-memory cache with size limit
const lookupCache = new Map<string, CacheEntry>();
// GO-LIVE-190: Track last cleanup time for periodic cleanup
let lastCleanupTime = Date.now();

/**
 * GO-LIVE-190: Clean expired cache entries with size limit enforcement
 * Removes expired entries and enforces maximum cache size
 */
function cleanCache(force = false): void {
  const now = Date.now();

  // Only clean every CLEANUP_INTERVAL_MS unless forced
  if (!force && now - lastCleanupTime < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupTime = now;

  // Remove expired entries
  for (const [key, entry] of lookupCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      lookupCache.delete(key);
    }
  }

  // GO-LIVE-190: If still over limit, remove oldest entries (FIFO)
  if (lookupCache.size > MAX_CACHE_SIZE) {
    const entriesToRemove = lookupCache.size - MAX_CACHE_SIZE;
    const iterator = lookupCache.keys();
    for (let i = 0; i < entriesToRemove; i++) {
      const key = iterator.next().value;
      if (key) lookupCache.delete(key);
    }
    console.log(`[barcodeLookup] GO-LIVE-190: Cache pruned, removed ${entriesToRemove} entries`);
  }
}

/**
 * Lookup barcode in Open Food Facts (free, open database)
 * https://world.openfoodfacts.org/api/v0/product/{barcode}.json
 */
async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeProductPrefill | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "SuperMandi-POS/1.0 (contact@supermandi.com)"
        }
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as any;

    if (data.status !== 1 || !data.product) {
      return null;
    }

    const product = data.product;

    return {
      barcode,
      name: product.product_name || product.product_name_en || "",
      brand: product.brands || "",
      description: product.generic_name || product.ingredients_text_en || "",
      unit: product.quantity || "pcs",
      imageUrl: product.image_url || product.image_front_url || "",
      category: product.categories?.split(",")[0]?.trim() || ""
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.warn("[barcodeLookup] Open Food Facts lookup timed out:", barcode);
    } else {
      console.warn("[barcodeLookup] Open Food Facts lookup failed:", barcode, (error as Error).message);
    }
    return null;
  }
}

/**
 * Lookup barcode in UPC Database API (if configured)
 * https://api.upcdatabase.org/product/{barcode}
 */
async function lookupUpcDatabase(barcode: string): Promise<BarcodeProductPrefill | null> {
  if (!UPC_DATABASE_API_KEY) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://api.upcdatabase.org/product/${encodeURIComponent(barcode)}`,
      {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${UPC_DATABASE_API_KEY}`
        }
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as any;

    if (!data.success || !data.title) {
      return null;
    }

    return {
      barcode,
      name: data.title || "",
      brand: data.brand || "",
      description: data.description || "",
      unit: "pcs",
      imageUrl: data.images?.[0] || "",
      category: data.category || ""
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.warn("[barcodeLookup] UPC Database lookup timed out:", barcode);
    } else {
      console.warn("[barcodeLookup] UPC Database lookup failed:", barcode, (error as Error).message);
    }
    return null;
  }
}

/**
 * Lookup barcode from external providers
 * Returns prefill data if found, null otherwise
 * Results are cached for 24 hours
 *
 * @param barcode - The barcode to lookup
 * @returns Product prefill data or null
 */
export async function lookupBarcodeExternal(barcode: string): Promise<BarcodeProductPrefill | null> {
  if (!BARCODE_LOOKUP_ENABLED) {
    return null;
  }

  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) {
    return null;
  }

  // GO-LIVE-190: Run cleanup periodically (time-based, not random)
  cleanCache();

  // Check cache first
  const cached = lookupCache.get(normalizedBarcode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    // Cache hit - no log needed for debug level
    return cached.data;
  }

  console.log("[barcodeLookup] Looking up barcode from external providers:", normalizedBarcode);

  // Try providers in order
  let result: BarcodeProductPrefill | null = null;

  // 1. Try Open Food Facts (free, no API key needed)
  result = await lookupOpenFoodFacts(normalizedBarcode);

  // 2. If not found and UPC Database is configured, try it
  if (!result && UPC_DATABASE_API_KEY) {
    result = await lookupUpcDatabase(normalizedBarcode);
  }

  // GO-LIVE-190: Check cache size before adding
  // If at limit, force cleanup to make room
  if (lookupCache.size >= MAX_CACHE_SIZE) {
    cleanCache(true);
  }

  // Cache result (even if null to prevent repeated lookups)
  lookupCache.set(normalizedBarcode, {
    data: result,
    timestamp: Date.now()
  });

  if (result) {
    console.log("[barcodeLookup] External barcode lookup found product:", normalizedBarcode, result.name);
  } else {
    console.log("[barcodeLookup] External barcode lookup returned no results:", normalizedBarcode);
  }

  return result;
}

/**
 * Clear the lookup cache (useful for testing)
 */
export function clearLookupCache(): void {
  lookupCache.clear();
}

/**
 * Get cache stats (useful for monitoring)
 * GO-LIVE-190: Added maxSize to monitor cache limits
 */
export function getLookupCacheStats(): { size: number; maxSize: number; ttlMs: number } {
  return {
    size: lookupCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS
  };
}
