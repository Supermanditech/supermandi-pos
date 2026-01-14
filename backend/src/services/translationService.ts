/**
 * Translation Service - I18N-006/007
 *
 * Provides product name translation using:
 * - Database cache (fastest)
 * - Translation glossary for domain terms
 * - Google Cloud Translation v3 API for new translations
 *
 * Environment variables required:
 * - GOOGLE_CLOUD_PROJECT: GCP project ID
 * - GOOGLE_TRANSLATE_LOCATION: Region (default: global)
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON
 */

import { createHash } from "crypto";
import type { Pool, PoolClient } from "pg";
import { TranslationServiceClient } from "@google-cloud/translate";

// =============================================================================
// GOOGLE CLOUD TRANSLATION CLIENT (Lazy Singleton)
// =============================================================================

let translationClient: TranslationServiceClient | null = null;
let translationClientInitFailed = false;

/**
 * Get or create the Google Cloud Translation client
 * Returns null if GCP credentials are not configured
 */
function getTranslationClient(): TranslationServiceClient | null {
  if (translationClientInitFailed) return null;
  if (translationClient) return translationClient;

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.warn("[translationService] GOOGLE_CLOUD_PROJECT not set. Machine translation disabled.");
    translationClientInitFailed = true;
    return null;
  }

  try {
    translationClient = new TranslationServiceClient();
    console.log("[translationService] Google Cloud Translation client initialized");
    return translationClient;
  } catch (error) {
    console.error("[translationService] Failed to initialize Translation client:", error);
    translationClientInitFailed = true;
    return null;
  }
}

// Types
export type SupportedLocale = "en" | "hi";
export type TranslationSource = "cache" | "database" | "glossary" | "machine" | "override";

export interface TranslatedProduct {
  id: string;
  name: string;
  displayName: string;
  brand: string | null;
  displayBrand: string | null;
  translationSource: TranslationSource;
}

export interface TranslationResult {
  text: string;
  source: TranslationSource;
}

interface GlossaryTerm {
  sourceTerm: string;
  targetTerm: string;
  domain: string;
}

// Configuration
const CACHE_TTL_HOURS = 24;
const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "hi"];

// In-memory cache for glossary terms (loaded once at startup)
let glossaryCache: Map<string, GlossaryTerm[]> | null = null;

/**
 * Generate cache key for translation lookup
 */
function generateCacheKey(text: string, targetLocale: string): string {
  const hash = createHash("sha256")
    .update(`${text}:${targetLocale}`)
    .digest("hex")
    .substring(0, 64);
  return hash;
}

/**
 * Load glossary terms into memory cache
 */
export async function loadGlossary(pool: Pool): Promise<void> {
  if (glossaryCache !== null) return;

  const result = await pool.query(`
    SELECT source_term, target_term, target_locale, domain
    FROM catalog.translation_glossary
    WHERE is_active = true
  `);

  glossaryCache = new Map();

  for (const row of result.rows) {
    const locale = row.target_locale as string;
    if (!glossaryCache.has(locale)) {
      glossaryCache.set(locale, []);
    }
    glossaryCache.get(locale)!.push({
      sourceTerm: row.source_term,
      targetTerm: row.target_term,
      domain: row.domain,
    });
  }
}

/**
 * Apply glossary substitutions to text
 */
function applyGlossary(text: string, targetLocale: SupportedLocale): { text: string; applied: boolean } {
  if (!glossaryCache || targetLocale === "en") {
    return { text, applied: false };
  }

  const terms = glossaryCache.get(targetLocale) || [];
  let result = text;
  let applied = false;

  for (const term of terms) {
    // Case-insensitive word boundary replacement
    const regex = new RegExp(`\\b${escapeRegex(term.sourceTerm)}\\b`, "gi");
    if (regex.test(result)) {
      result = result.replace(regex, term.targetTerm);
      applied = true;
    }
  }

  return { text: result, applied };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check translation cache in database
 */
async function checkCache(
  pool: Pool,
  cacheKey: string
): Promise<string | null> {
  const result = await pool.query(
    `
    UPDATE catalog.translation_cache
    SET hit_count = hit_count + 1
    WHERE cache_key = $1 AND expires_at > NOW()
    RETURNING translated_text
    `,
    [cacheKey]
  );

  return result.rows.length > 0 ? result.rows[0].translated_text : null;
}

/**
 * Store translation in cache
 */
async function storeCache(
  pool: Pool,
  cacheKey: string,
  sourceText: string,
  translatedText: string,
  sourceLocale: string,
  targetLocale: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000);

  await pool.query(
    `
    INSERT INTO catalog.translation_cache
      (cache_key, source_text, translated_text, source_locale, target_locale, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (cache_key) DO UPDATE SET
      translated_text = EXCLUDED.translated_text,
      hit_count = catalog.translation_cache.hit_count + 1,
      expires_at = EXCLUDED.expires_at
    `,
    [cacheKey, sourceText, translatedText, sourceLocale, targetLocale, expiresAt]
  );
}

/**
 * Get product translation from database
 */
async function getProductTranslation(
  pool: Pool,
  productId: string,
  locale: SupportedLocale
): Promise<{ name: string | null; brand: string | null; source: TranslationSource } | null> {
  const result = await pool.query(
    `
    SELECT name, brand, translation_source
    FROM catalog.product_translations
    WHERE product_id = $1 AND locale = $2
    `,
    [productId, locale]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    name: row.name,
    brand: row.brand,
    source: row.translation_source === "machine" ? "machine" : "database",
  };
}

/**
 * Get store-level translation override
 */
async function getTranslationOverride(
  pool: Pool,
  storeId: string,
  productId: string,
  locale: SupportedLocale
): Promise<{ name: string | null; description: string | null } | null> {
  const result = await pool.query(
    `
    SELECT name_override, description_override
    FROM catalog.translation_overrides
    WHERE store_id = $1 AND product_id = $2 AND locale = $3
    `,
    [storeId, productId, locale]
  );

  if (result.rows.length === 0) return null;

  return {
    name: result.rows[0].name_override,
    description: result.rows[0].description_override,
  };
}

/**
 * Save product translation to database
 */
export async function saveProductTranslation(
  pool: Pool,
  productId: string,
  locale: SupportedLocale,
  name: string,
  brand: string | null,
  source: "machine" | "manual" | "glossary"
): Promise<void> {
  await pool.query(
    `
    INSERT INTO catalog.product_translations (product_id, locale, name, brand, translation_source)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      translation_source = EXCLUDED.translation_source,
      updated_at = NOW()
    `,
    [productId, locale, name, brand, source]
  );
}

/**
 * Save store-level translation override
 */
export async function saveTranslationOverride(
  pool: Pool,
  storeId: string,
  productId: string,
  locale: SupportedLocale,
  nameOverride: string | null,
  descriptionOverride: string | null
): Promise<void> {
  await pool.query(
    `
    INSERT INTO catalog.translation_overrides
      (store_id, product_id, locale, name_override, description_override)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (store_id, product_id, locale) DO UPDATE SET
      name_override = EXCLUDED.name_override,
      description_override = EXCLUDED.description_override,
      updated_at = NOW()
    `,
    [storeId, productId, locale, nameOverride, descriptionOverride]
  );
}

/**
 * Translate text using Google Cloud Translation v3 API
 * GO-LIVE-TR-004: Production integration
 *
 * Features:
 * - Lazy client initialization
 * - Glossary support for domain-specific terms
 * - Graceful fallback if GCP not configured
 * - Rate limiting via caller (batch endpoints)
 */
async function translateWithGoogleCloud(
  text: string,
  targetLocale: string
): Promise<string> {
  const client = getTranslationClient();
  if (!client) {
    // GCP not configured - return original text (glossary already applied by caller)
    return text;
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT!;
  const location = process.env.GOOGLE_TRANSLATE_LOCATION || "global";
  const parent = `projects/${projectId}/locations/${location}`;

  // Build glossary config if glossary exists
  const glossaryId = process.env.GOOGLE_TRANSLATE_GLOSSARY || "supermandi-glossary";
  const glossaryPath = `${parent}/glossaries/${glossaryId}`;

  try {
    const [response] = await client.translateText({
      parent,
      contents: [text],
      targetLanguageCode: targetLocale,
      sourceLanguageCode: "en",
      mimeType: "text/plain",
      // Only use glossary if explicitly enabled (requires pre-created glossary in GCP)
      ...(process.env.GOOGLE_TRANSLATE_USE_GLOSSARY === "true" && {
        glossaryConfig: {
          glossary: glossaryPath,
          ignoreCase: true,
        },
      }),
    });

    const translated = response.translations?.[0]?.translatedText;
    if (translated) {
      return translated;
    }

    console.warn("[translationService] Empty translation response, using original text");
    return text;
  } catch (error: any) {
    // Handle specific GCP errors
    if (error.code === 7) {
      // PERMISSION_DENIED
      console.error("[translationService] GCP permission denied. Check service account.");
    } else if (error.code === 8) {
      // RESOURCE_EXHAUSTED (quota)
      console.warn("[translationService] Translation API quota exceeded. Using glossary only.");
    } else if (error.code === 5) {
      // NOT_FOUND (glossary doesn't exist)
      console.warn("[translationService] Glossary not found. Retrying without glossary.");
      // Retry without glossary
      try {
        const [response] = await client.translateText({
          parent,
          contents: [text],
          targetLanguageCode: targetLocale,
          sourceLanguageCode: "en",
          mimeType: "text/plain",
        });
        return response.translations?.[0]?.translatedText || text;
      } catch (retryError) {
        console.error("[translationService] Translation retry failed:", retryError);
        return text;
      }
    } else {
      console.error("[translationService] Translation API error:", error.message || error);
    }

    // Fallback to original text (with glossary substitutions already applied)
    return text;
  }
}

/**
 * Translate text with full pipeline: cache -> glossary -> machine translation
 */
export async function translateText(
  pool: Pool,
  text: string,
  targetLocale: SupportedLocale
): Promise<TranslationResult> {
  // English doesn't need translation
  if (targetLocale === "en" || !text?.trim()) {
    return { text, source: "cache" };
  }

  const cacheKey = generateCacheKey(text, targetLocale);

  // 1. Check translation cache
  const cached = await checkCache(pool, cacheKey);
  if (cached) {
    return { text: cached, source: "cache" };
  }

  // 2. Apply glossary terms
  const glossaryResult = applyGlossary(text, targetLocale);
  if (glossaryResult.applied) {
    // If glossary fully handled it (no remaining English words), cache and return
    const hasEnglish = /[a-zA-Z]/.test(glossaryResult.text);
    if (!hasEnglish) {
      await storeCache(pool, cacheKey, text, glossaryResult.text, "en", targetLocale);
      return { text: glossaryResult.text, source: "glossary" };
    }
  }

  // 3. Use machine translation for remaining text
  try {
    const machineTranslated = await translateWithGoogleCloud(
      glossaryResult.text,
      targetLocale
    );
    await storeCache(pool, cacheKey, text, machineTranslated, "en", targetLocale);
    return { text: machineTranslated, source: "machine" };
  } catch (error) {
    console.error("[translationService] Machine translation failed:", error);
    // Fall back to glossary-only result
    return { text: glossaryResult.text, source: "glossary" };
  }
}

/**
 * Get localized product with translation chain:
 * 1. Store-level override (if exists)
 * 2. Product translation (from database)
 * 3. On-demand translation (glossary + machine)
 * 4. Original English text (fallback)
 */
export async function getLocalizedProduct(
  pool: Pool,
  product: {
    id: string;
    name: string;
    brand: string | null;
  },
  locale: SupportedLocale,
  storeId?: string
): Promise<TranslatedProduct> {
  // English doesn't need translation
  if (locale === "en") {
    return {
      id: product.id,
      name: product.name,
      displayName: product.name,
      brand: product.brand,
      displayBrand: product.brand,
      translationSource: "cache",
    };
  }

  let displayName = product.name;
  let displayBrand = product.brand;
  let source: TranslationSource = "cache";

  // 1. Check store-level override first
  if (storeId) {
    const override = await getTranslationOverride(pool, storeId, product.id, locale);
    if (override?.name) {
      displayName = override.name;
      source = "override";
    }
  }

  // 2. If no override, check product translation
  if (source !== "override") {
    const translation = await getProductTranslation(pool, product.id, locale);
    if (translation?.name) {
      displayName = translation.name;
      displayBrand = translation.brand || displayBrand;
      source = translation.source;
    }
  }

  // 3. If still no translation, generate one on-demand
  if (source === "cache" && displayName === product.name) {
    const nameResult = await translateText(pool, product.name, locale);
    displayName = nameResult.text;
    source = nameResult.source;

    // Save for future use
    if (nameResult.source === "machine" || nameResult.source === "glossary") {
      let translatedBrand: string | null = null;
      if (product.brand) {
        const brandResult = await translateText(pool, product.brand, locale);
        translatedBrand = brandResult.text;
        displayBrand = translatedBrand;
      }

      await saveProductTranslation(
        pool,
        product.id,
        locale,
        displayName,
        translatedBrand,
        nameResult.source === "machine" ? "machine" : "glossary"
      );
    }
  }

  return {
    id: product.id,
    name: product.name,
    displayName,
    brand: product.brand,
    displayBrand,
    translationSource: source,
  };
}

/**
 * Batch localize multiple products (optimized for list views)
 */
export async function getLocalizedProducts(
  pool: Pool,
  products: Array<{ id: string; name: string; brand: string | null }>,
  locale: SupportedLocale,
  storeId?: string
): Promise<TranslatedProduct[]> {
  // For English, return immediately
  if (locale === "en") {
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      displayName: p.name,
      brand: p.brand,
      displayBrand: p.brand,
      translationSource: "cache" as TranslationSource,
    }));
  }

  // Load glossary if not cached
  await loadGlossary(pool);

  // Batch fetch existing translations
  const productIds = products.map((p) => p.id);
  const existingTranslations = await pool.query(
    `
    SELECT product_id, name, brand, translation_source
    FROM catalog.product_translations
    WHERE product_id = ANY($1) AND locale = $2
    `,
    [productIds, locale]
  );

  const translationMap = new Map<string, { name: string; brand: string | null; source: string }>();
  for (const row of existingTranslations.rows) {
    translationMap.set(row.product_id, {
      name: row.name,
      brand: row.brand,
      source: row.translation_source,
    });
  }

  // Batch fetch store overrides if applicable
  const overrideMap = new Map<string, { name: string | null }>();
  if (storeId) {
    const overrides = await pool.query(
      `
      SELECT product_id, name_override
      FROM catalog.translation_overrides
      WHERE store_id = $1 AND product_id = ANY($2) AND locale = $3
      `,
      [storeId, productIds, locale]
    );
    for (const row of overrides.rows) {
      overrideMap.set(row.product_id, { name: row.name_override });
    }
  }

  // Build results
  const results: TranslatedProduct[] = [];

  for (const product of products) {
    // Check override first
    const override = overrideMap.get(product.id);
    if (override?.name) {
      results.push({
        id: product.id,
        name: product.name,
        displayName: override.name,
        brand: product.brand,
        displayBrand: product.brand,
        translationSource: "override",
      });
      continue;
    }

    // Check existing translation
    const translation = translationMap.get(product.id);
    if (translation?.name) {
      results.push({
        id: product.id,
        name: product.name,
        displayName: translation.name,
        brand: product.brand,
        displayBrand: translation.brand || product.brand,
        translationSource: translation.source === "machine" ? "machine" : "database",
      });
      continue;
    }

    // Fall back to glossary-only for batch (no machine translation to avoid API spam)
    const glossaryResult = applyGlossary(product.name, locale);
    results.push({
      id: product.id,
      name: product.name,
      displayName: glossaryResult.text,
      brand: product.brand,
      displayBrand: product.brand ? applyGlossary(product.brand, locale).text : null,
      translationSource: glossaryResult.applied ? "glossary" : "cache",
    });
  }

  return results;
}

/**
 * Check if locale is supported
 */
export function isLocaleSupported(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

/**
 * Clean up expired cache entries (call periodically)
 */
export async function cleanupExpiredCache(pool: Pool): Promise<number> {
  const result = await pool.query(`
    DELETE FROM catalog.translation_cache
    WHERE expires_at < NOW()
  `);
  return result.rowCount || 0;
}

/**
 * TR-PEND-003: Health check for translation service
 * Returns status of Google Cloud Translation v3 integration
 */
export interface TranslationHealthStatus {
  ok: boolean;
  provider: "google_v3" | "glossary_only" | "disabled";
  message?: string;
  configured: {
    projectId: boolean;
    credentials: boolean;
    glossary: boolean;
  };
}

export function getTranslationHealth(): TranslationHealthStatus {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const glossaryEnabled = process.env.GOOGLE_TRANSLATE_USE_GLOSSARY === "true";

  // Check if client initialization has failed
  if (translationClientInitFailed) {
    return {
      ok: true, // Still "ok" because we fall back gracefully
      provider: "glossary_only",
      message: "Google Cloud Translation client failed to initialize. Using glossary fallback.",
      configured: {
        projectId: !!projectId,
        credentials: !!credentials,
        glossary: glossaryEnabled,
      },
    };
  }

  // Check if GCP is configured
  if (!projectId) {
    return {
      ok: true,
      provider: "glossary_only",
      message: "GOOGLE_CLOUD_PROJECT not configured. Using glossary fallback.",
      configured: {
        projectId: false,
        credentials: !!credentials,
        glossary: glossaryEnabled,
      },
    };
  }

  // Try to get/create client
  const client = getTranslationClient();
  if (!client) {
    return {
      ok: true,
      provider: "glossary_only",
      message: "Translation client unavailable. Using glossary fallback.",
      configured: {
        projectId: true,
        credentials: !!credentials,
        glossary: glossaryEnabled,
      },
    };
  }

  // All good - GCT v3 is available
  return {
    ok: true,
    provider: "google_v3",
    configured: {
      projectId: true,
      credentials: !!credentials,
      glossary: glossaryEnabled,
    },
  };
}

/**
 * TR-PEND-003: Verify translateText never throws uncaught errors
 * Wraps the main translate function with guaranteed fallback
 */
export async function translateTextSafe(
  pool: Pool,
  text: string,
  targetLocale: SupportedLocale
): Promise<string> {
  try {
    const result = await translateText(pool, text, targetLocale);
    // Never return empty string
    return result.text || text;
  } catch (error) {
    console.error("[translationService] translateTextSafe caught error:", error);
    // Ultimate fallback: return original text
    return text;
  }
}

// =============================================================================
// TR-PEND-004: QUOTA MANAGEMENT
// =============================================================================

export interface QuotaStatus {
  productsUsed: number;
  productsRemaining: number;
  charactersUsed: number;
  charactersRemaining: number;
  isExceeded: boolean;
  resetAt: Date;
}

/**
 * Check and consume translation quota for a store
 * Returns true if within quota, false if exceeded
 */
export async function checkTranslationQuota(
  pool: Pool,
  storeId: string,
  productCount: number = 1,
  charCount: number = 0
): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT catalog.check_translation_quota($1, $2, $3) as within_quota`,
      [storeId, productCount, charCount]
    );
    const withinQuota = result.rows[0]?.within_quota ?? true;

    if (!withinQuota) {
      console.warn(
        `[translationService] Quota exceeded for store ${storeId}. ` +
        `Requested: ${productCount} products, ${charCount} chars. ` +
        `Degrading to glossary-only mode.`
      );
    }

    return withinQuota;
  } catch (error) {
    // On error, allow the request (fail open for availability)
    console.error("[translationService] Quota check failed:", error);
    return true;
  }
}

/**
 * Get current quota status for a store
 */
export async function getQuotaStatus(
  pool: Pool,
  storeId: string
): Promise<QuotaStatus> {
  try {
    const result = await pool.query(
      `SELECT * FROM catalog.get_translation_quota_status($1)`,
      [storeId]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        productsUsed: 0,
        productsRemaining: 500,
        charactersUsed: 0,
        charactersRemaining: 500000,
        isExceeded: false,
        resetAt: new Date(new Date().setHours(24, 0, 0, 0)),
      };
    }

    return {
      productsUsed: row.products_used,
      productsRemaining: row.products_remaining,
      charactersUsed: row.characters_used,
      charactersRemaining: row.characters_remaining,
      isExceeded: row.is_exceeded,
      resetAt: new Date(row.reset_at),
    };
  } catch (error) {
    console.error("[translationService] Failed to get quota status:", error);
    return {
      productsUsed: 0,
      productsRemaining: 500,
      charactersUsed: 0,
      charactersRemaining: 500000,
      isExceeded: false,
      resetAt: new Date(new Date().setHours(24, 0, 0, 0)),
    };
  }
}

/**
 * Batch localize with quota awareness
 * TR-PEND-004: Degrades to glossary-only when quota exceeded
 */
export async function getLocalizedProductsWithQuota(
  pool: Pool,
  products: Array<{ id: string; name: string; brand: string | null }>,
  locale: SupportedLocale,
  storeId: string
): Promise<{ products: TranslatedProduct[]; quotaExceeded: boolean }> {
  // For English, no quota needed
  if (locale === "en") {
    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        displayName: p.name,
        brand: p.brand,
        displayBrand: p.brand,
        translationSource: "cache" as TranslationSource,
      })),
      quotaExceeded: false,
    };
  }

  // Check quota before processing
  const withinQuota = await checkTranslationQuota(pool, storeId, products.length);

  if (!withinQuota) {
    // Quota exceeded - use glossary-only mode
    await loadGlossary(pool);

    const glossaryOnlyProducts = products.map((p) => {
      const glossaryResult = applyGlossary(p.name, locale);
      return {
        id: p.id,
        name: p.name,
        displayName: glossaryResult.text,
        brand: p.brand,
        displayBrand: p.brand ? applyGlossary(p.brand, locale).text : null,
        translationSource: glossaryResult.applied ? "glossary" : "cache" as TranslationSource,
      };
    });

    return {
      products: glossaryOnlyProducts,
      quotaExceeded: true,
    };
  }

  // Within quota - proceed with full localization
  const localizedProducts = await getLocalizedProducts(pool, products, locale, storeId);

  return {
    products: localizedProducts,
    quotaExceeded: false,
  };
}
