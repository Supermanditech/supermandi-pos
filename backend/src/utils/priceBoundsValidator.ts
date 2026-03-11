/**
 * SA-P0-003: Global Price Bounds Validation
 *
 * Fetches configurable min/max price bounds from platform.price_bounds
 * and validates prices against them. Bounds are cached for 5 minutes.
 */

import { getPool } from "../db/client";
import { log } from "../lib/logger";

export interface PriceBounds {
  min_price_paise: number;
  max_price_paise: number;
  updated_at: string;
}

export interface PriceBoundsValidation {
  valid: boolean;
  code?: "PRICE_OUT_OF_BOUNDS";
  error?: string;
  min?: number;
  max?: number;
}

// =============================================================================
// CACHE (5-minute TTL)
// =============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedBounds: PriceBounds | null = null;
let cacheTimestamp = 0;

/** Fallback bounds if DB is unavailable */
const FALLBACK_BOUNDS: PriceBounds = {
  min_price_paise: 100,        // ₹1
  max_price_paise: 10000000,   // ₹1,00,000
  updated_at: new Date().toISOString(),
};

/**
 * Fetch price bounds from DB (with cache).
 * Returns fallback bounds if DB is unavailable.
 */
export async function getPriceBounds(): Promise<PriceBounds> {
  const now = Date.now();
  if (cachedBounds && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedBounds;
  }

  const pool = getPool();
  if (!pool) {
    log.warn("[priceBounds] DB pool unavailable, using fallback bounds");
    return FALLBACK_BOUNDS;
  }

  try {
    const result = await pool.query(
      "SELECT min_price_paise, max_price_paise, updated_at FROM platform.price_bounds ORDER BY id LIMIT 1"
    );
    if (result.rows.length > 0) {
      cachedBounds = {
        min_price_paise: parseInt(result.rows[0].min_price_paise, 10),
        max_price_paise: parseInt(result.rows[0].max_price_paise, 10),
        updated_at: result.rows[0].updated_at,
      };
      cacheTimestamp = now;
      return cachedBounds;
    }
    // No rows — use fallback
    return FALLBACK_BOUNDS;
  } catch (err) {
    log.error("[priceBounds] Failed to fetch price bounds:", err);
    return FALLBACK_BOUNDS;
  }
}

/**
 * Validate a price in paise against the global price bounds.
 */
export async function validatePriceBounds(pricePaise: number): Promise<PriceBoundsValidation> {
  if (typeof pricePaise !== "number" || !Number.isFinite(pricePaise)) {
    return { valid: false, error: "Price must be a finite number" };
  }

  const bounds = await getPriceBounds();

  if (pricePaise < bounds.min_price_paise) {
    return {
      valid: false,
      code: "PRICE_OUT_OF_BOUNDS",
      error: `Price ${pricePaise} paise is below minimum of ${bounds.min_price_paise} paise (₹${(bounds.min_price_paise / 100).toFixed(2)})`,
      min: bounds.min_price_paise,
      max: bounds.max_price_paise,
    };
  }

  if (pricePaise > bounds.max_price_paise) {
    return {
      valid: false,
      code: "PRICE_OUT_OF_BOUNDS",
      error: `Price ${pricePaise} paise exceeds maximum of ${bounds.max_price_paise} paise (₹${(bounds.max_price_paise / 100).toFixed(2)})`,
      min: bounds.min_price_paise,
      max: bounds.max_price_paise,
    };
  }

  return { valid: true };
}

/**
 * Invalidate the cached bounds (e.g., after admin updates).
 */
export function invalidatePriceBoundsCache(): void {
  cachedBounds = null;
  cacheTimestamp = 0;
}
