-- CAT-AUTO-001: Bridge purchase-flow products to catalog schema + backfill taxonomy
-- Ensures store products created via BUY flow appear in categories API
-- Idempotent: safe to run multiple times

BEGIN;

-- =============================================================================
-- STEP 1: Bridge public.products → catalog.products
-- Purchase flow creates products in public.products (TEXT id).
-- catalog.store_products has FK to catalog.products (UUID id).
-- Bridge by inserting missing rows with id cast.
-- =============================================================================
INSERT INTO catalog.products (id, name, is_active, created_at, updated_at)
SELECT
  p.id::uuid,
  p.name,
  true,
  COALESCE(p.created_at, NOW()),
  COALESCE(p.updated_at, NOW())
FROM products p
WHERE p.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (
    SELECT 1 FROM catalog.products cp WHERE cp.id = p.id::uuid
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- STEP 2: Bridge public.store_products → catalog.store_products with taxonomy
-- Purchase flow writes to public.store_products (TEXT ids, no taxonomy_id).
-- Categories API reads from catalog.store_products (UUID ids, has taxonomy_id).
-- Bridge by creating catalog rows with auto-assigned taxonomy.
-- =============================================================================
INSERT INTO catalog.store_products (
  id, store_id, product_id, purchase_price, display_name,
  taxonomy_id, is_active, metadata_updated_by, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  sp.store_id::uuid,
  sp.global_product_id::uuid,
  sp.purchase_price_minor,
  COALESCE(sp.store_display_name, gp.global_name),
  catalog.assign_taxonomy_by_name(COALESCE(sp.store_display_name, gp.global_name, '')),
  true,
  'BACKFILL',
  COALESCE(sp.created_at, NOW()),
  COALESCE(sp.updated_at, NOW())
FROM store_products sp
JOIN global_products gp ON gp.id = sp.global_product_id
WHERE sp.store_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND sp.global_product_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM catalog.products cp WHERE cp.id = sp.global_product_id::uuid
  )
  AND NOT EXISTS (
    SELECT 1 FROM catalog.store_products csp
    WHERE csp.store_id = sp.store_id::uuid
      AND csp.product_id = sp.global_product_id::uuid
  )
ON CONFLICT (store_id, product_id) DO NOTHING;

-- =============================================================================
-- STEP 3: Re-backfill NULL taxonomy on existing catalog.store_products
-- Catches any products that slipped through without taxonomy since migration 027.
-- =============================================================================
UPDATE catalog.store_products sp
SET taxonomy_id = catalog.assign_taxonomy_by_name(
  COALESCE(sp.display_name, p.name, '')
)
FROM catalog.products p
WHERE sp.product_id = p.id
  AND sp.taxonomy_id IS NULL
  AND sp.is_active = true;

COMMIT;
