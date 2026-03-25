-- Migration: 009_translation_search_indexes
-- ROLLBACK: DROP INDEX IF EXISTS catalog.idx_product_translations_product_locale, catalog.idx_product_translations_brand_trgm, catalog.idx_product_translations_hindi_active, catalog.idx_translation_overrides_store_product_locale, catalog.idx_translation_overrides_store_hindi, catalog.idx_translation_cache_key_lookup, catalog.idx_translation_cache_locale, catalog.idx_translation_glossary_locale_domain, catalog.idx_translation_glossary_source_lower;
-- TR-PEND-001: Performance indexes for Hindi search parity
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- PRODUCT TRANSLATIONS: Indexes for Hindi Search Parity (GO-LIVE-TR-006)
-- =============================================================================

-- Composite index for fast joins: (product_id, locale)
-- Used by SELL and BUY search queries that LEFT JOIN product_translations
CREATE INDEX IF NOT EXISTS idx_product_translations_product_locale
  ON catalog.product_translations (product_id, locale);

-- Trigram index for brand search in Hindi
-- Enables similarity() searches on translated brand names
CREATE INDEX IF NOT EXISTS idx_product_translations_brand_trgm
  ON catalog.product_translations USING gin (brand gin_trgm_ops)
  WHERE brand IS NOT NULL;

-- Partial index for active Hindi translations only (most common query)
-- Speeds up the LEFT JOIN ... WHERE locale = 'hi' pattern
CREATE INDEX IF NOT EXISTS idx_product_translations_hindi_active
  ON catalog.product_translations (product_id)
  WHERE locale = 'hi';

-- =============================================================================
-- TRANSLATION OVERRIDES: Store-scoped indexes
-- =============================================================================

-- Composite index for store+product+locale lookups
-- The UNIQUE constraint already creates an index, but this ensures optimal order
CREATE INDEX IF NOT EXISTS idx_translation_overrides_store_product_locale
  ON catalog.translation_overrides (store_id, product_id, locale);

-- Partial index for Hindi overrides per store (most common query)
CREATE INDEX IF NOT EXISTS idx_translation_overrides_store_hindi
  ON catalog.translation_overrides (store_id, product_id)
  WHERE locale = 'hi';

-- =============================================================================
-- TRANSLATION CACHE: Cleanup and lookup optimization
-- =============================================================================

-- Index for cache key lookups (already exists, but ensure it's present)
-- NOTE: Cannot use WHERE expires_at > NOW() as NOW() is not immutable
CREATE INDEX IF NOT EXISTS idx_translation_cache_key_lookup
  ON catalog.translation_cache (cache_key);

-- Index for target locale cache hits
CREATE INDEX IF NOT EXISTS idx_translation_cache_locale
  ON catalog.translation_cache (target_locale, cache_key);

-- =============================================================================
-- GLOSSARY: Fast term lookups
-- =============================================================================

-- Composite index for glossary lookups by locale and domain
CREATE INDEX IF NOT EXISTS idx_translation_glossary_locale_domain
  ON catalog.translation_glossary (target_locale, domain)
  WHERE is_active = true;

-- Case-insensitive source term lookup
CREATE INDEX IF NOT EXISTS idx_translation_glossary_source_lower
  ON catalog.translation_glossary (LOWER(source_term), target_locale)
  WHERE is_active = true;

COMMIT;
