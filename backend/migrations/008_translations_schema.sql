-- Migration: 008_translations_schema
-- V3.0.10 I18N: Product translations and store-level overrides
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: catalog.product_translations
-- Machine-generated or manually curated translations for products
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.product_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product_id UUID NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,

  -- Locale (ISO 639-1 language code)
  locale VARCHAR(10) NOT NULL,

  -- Translated fields
  name VARCHAR(500),
  brand VARCHAR(255),
  description TEXT,

  -- Translation metadata
  translation_source VARCHAR(20) NOT NULL DEFAULT 'machine',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT product_translations_unique UNIQUE (product_id, locale),
  CONSTRAINT chk_translation_source CHECK (
    translation_source IN ('machine', 'manual', 'glossary')
  ),
  CONSTRAINT chk_locale_format CHECK (
    locale ~ '^[a-z]{2}(-[A-Z]{2})?$'
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_catalog_product_translations_updated_at ON catalog.product_translations;
CREATE TRIGGER update_catalog_product_translations_updated_at
  BEFORE UPDATE ON catalog.product_translations
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Product lookup (find all translations for a product)
CREATE INDEX IF NOT EXISTS product_translations_product_idx
  ON catalog.product_translations (product_id);

-- Locale lookup (find all products with a specific locale translation)
CREATE INDEX IF NOT EXISTS product_translations_locale_idx
  ON catalog.product_translations (locale);

-- Trigram index for translated name search
CREATE INDEX IF NOT EXISTS idx_product_translations_name_trgm
  ON catalog.product_translations USING gin (name gin_trgm_ops);

-- =============================================================================
-- TABLE: catalog.translation_overrides
-- Store-level translation overrides (retailer customizations)
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.translation_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id UUID NOT NULL,  -- FK to platform.stores
  product_id UUID NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,

  -- Locale (ISO 639-1 language code)
  locale VARCHAR(10) NOT NULL,

  -- Override fields (NULL means use default translation)
  name_override VARCHAR(500),
  description_override TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT translation_overrides_unique UNIQUE (store_id, product_id, locale),
  CONSTRAINT chk_override_locale_format CHECK (
    locale ~ '^[a-z]{2}(-[A-Z]{2})?$'
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_catalog_translation_overrides_updated_at ON catalog.translation_overrides;
CREATE TRIGGER update_catalog_translation_overrides_updated_at
  BEFORE UPDATE ON catalog.translation_overrides
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Store lookup (find all overrides for a store)
CREATE INDEX IF NOT EXISTS translation_overrides_store_idx
  ON catalog.translation_overrides (store_id);

-- Product lookup (find all store overrides for a product)
CREATE INDEX IF NOT EXISTS translation_overrides_product_idx
  ON catalog.translation_overrides (product_id);

-- =============================================================================
-- TABLE: catalog.translation_glossary
-- Domain-specific terms for consistent translations
-- Used by Google Cloud Translation glossary feature
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.translation_glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source and target terms
  source_term VARCHAR(255) NOT NULL,
  target_term VARCHAR(255) NOT NULL,

  -- Target locale (ISO 639-1)
  target_locale VARCHAR(10) NOT NULL,

  -- Domain categorization
  domain VARCHAR(50) NOT NULL DEFAULT 'product',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT translation_glossary_unique UNIQUE (source_term, target_locale),
  CONSTRAINT chk_glossary_domain CHECK (
    domain IN ('product', 'brand', 'unit', 'category', 'general')
  ),
  CONSTRAINT chk_glossary_locale_format CHECK (
    target_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_catalog_translation_glossary_updated_at ON catalog.translation_glossary;
CREATE TRIGGER update_catalog_translation_glossary_updated_at
  BEFORE UPDATE ON catalog.translation_glossary
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Source term lookup
CREATE INDEX IF NOT EXISTS translation_glossary_source_idx
  ON catalog.translation_glossary (source_term);

-- Locale lookup
CREATE INDEX IF NOT EXISTS translation_glossary_locale_idx
  ON catalog.translation_glossary (target_locale);

-- Active glossary terms
CREATE INDEX IF NOT EXISTS translation_glossary_active_idx
  ON catalog.translation_glossary (target_locale, domain)
  WHERE is_active = true;

-- =============================================================================
-- TABLE: catalog.translation_cache
-- Cache for machine-translated text (reduces API calls)
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache key (hash of source text + locale)
  cache_key VARCHAR(64) NOT NULL,

  -- Source and translated text
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,

  -- Locale
  source_locale VARCHAR(10) NOT NULL DEFAULT 'en',
  target_locale VARCHAR(10) NOT NULL,

  -- Cache metadata
  hit_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT translation_cache_key_unique UNIQUE (cache_key)
);

-- Cache lookup
CREATE INDEX IF NOT EXISTS translation_cache_key_idx
  ON catalog.translation_cache (cache_key);

-- Expiry cleanup (find expired entries)
-- NOTE: Cannot use WHERE expires_at < NOW() as NOW() is not immutable
CREATE INDEX IF NOT EXISTS translation_cache_expires_idx
  ON catalog.translation_cache (expires_at);

-- =============================================================================
-- SEED: Initial glossary terms for Hindi
-- =============================================================================
INSERT INTO catalog.translation_glossary (source_term, target_term, target_locale, domain, is_active)
VALUES
  -- Units (always kept as-is or transliterated)
  ('MRP', 'MRP', 'hi', 'general', true),
  ('SKU', 'SKU', 'hi', 'general', true),
  ('GST', 'GST', 'hi', 'general', true),
  ('kg', 'किग्रा', 'hi', 'unit', true),
  ('g', 'ग्राम', 'hi', 'unit', true),
  ('L', 'लीटर', 'hi', 'unit', true),
  ('ml', 'मिली', 'hi', 'unit', true),
  ('pc', 'पीस', 'hi', 'unit', true),
  ('pcs', 'पीस', 'hi', 'unit', true),
  ('pack', 'पैक', 'hi', 'unit', true),
  ('box', 'डिब्बा', 'hi', 'unit', true),
  ('dozen', 'दर्जन', 'hi', 'unit', true),

  -- Common brands (transliterated to Hindi)
  ('Tata', 'टाटा', 'hi', 'brand', true),
  ('Amul', 'अमूल', 'hi', 'brand', true),
  ('Britannia', 'ब्रिटानिया', 'hi', 'brand', true),
  ('Parle', 'पार्ले', 'hi', 'brand', true),
  ('Haldiram', 'हल्दीराम', 'hi', 'brand', true),
  ('MTR', 'MTR', 'hi', 'brand', true),
  ('Nestle', 'नेस्ले', 'hi', 'brand', true),
  ('Maggi', 'मैगी', 'hi', 'brand', true),
  ('Patanjali', 'पतंजलि', 'hi', 'brand', true),
  ('Fortune', 'फॉर्च्यून', 'hi', 'brand', true),
  ('Aashirvaad', 'आशीर्वाद', 'hi', 'brand', true),

  -- Common product terms
  ('Basmati', 'बासमती', 'hi', 'product', true),
  ('Atta', 'आटा', 'hi', 'product', true),
  ('Dal', 'दाल', 'hi', 'product', true),
  ('Rice', 'चावल', 'hi', 'product', true),
  ('Salt', 'नमक', 'hi', 'product', true),
  ('Sugar', 'चीनी', 'hi', 'product', true),
  ('Oil', 'तेल', 'hi', 'product', true),
  ('Ghee', 'घी', 'hi', 'product', true),
  ('Milk', 'दूध', 'hi', 'product', true),
  ('Paneer', 'पनीर', 'hi', 'product', true),
  ('Curd', 'दही', 'hi', 'product', true),
  ('Butter', 'मक्खन', 'hi', 'product', true),

  -- Categories
  ('Grocery', 'किराना', 'hi', 'category', true),
  ('Dairy', 'डेयरी', 'hi', 'category', true),
  ('Beverages', 'पेय पदार्थ', 'hi', 'category', true),
  ('Snacks', 'नाश्ता', 'hi', 'category', true),
  ('Personal Care', 'पर्सनल केयर', 'hi', 'category', true),
  ('Household', 'घरेलू सामान', 'hi', 'category', true)
ON CONFLICT (source_term, target_locale) DO UPDATE SET
  target_term = EXCLUDED.target_term,
  domain = EXCLUDED.domain,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- =============================================================================
-- SEED: Sample Hindi translations for demo products
-- =============================================================================
INSERT INTO catalog.product_translations (product_id, locale, name, brand, translation_source)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'hi', 'टाटा नमक 1 किग्रा', 'टाटा', 'manual'),
  ('c0000000-0000-0000-0000-000000000002', 'hi', 'आशीर्वाद आटा 5 किग्रा', 'आशीर्वाद', 'manual'),
  ('c0000000-0000-0000-0000-000000000003', 'hi', 'फॉर्च्यून सनफ्लावर ऑयल 1 लीटर', 'फॉर्च्यून', 'manual')
ON CONFLICT (product_id, locale) DO UPDATE SET
  name = EXCLUDED.name,
  brand = EXCLUDED.brand,
  translation_source = EXCLUDED.translation_source,
  updated_at = NOW();

COMMIT;
