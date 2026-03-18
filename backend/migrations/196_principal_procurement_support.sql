-- V3-HARDEN-147: Schema support for principal procurement lane
-- Forward-only migration — adds columns/tables for the SuperMandi principal-sale model
-- ROLLBACK: ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS procurement_lane, DROP COLUMN IF EXISTS linked_procurement_id, DROP COLUMN IF EXISTS invoice_pair_id; ALTER TABLE catalog.supplier_products DROP COLUMN IF EXISTS billing_model; DROP TABLE IF EXISTS public.invoice_dispatch_logs;

-- 1. Add procurement_lane to purchase orders (CATALOGUE_PRINCIPAL | COUNTER_PURCHASE)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'procurement_lane'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD COLUMN procurement_lane VARCHAR(30) DEFAULT 'CATALOGUE_PRINCIPAL';
    COMMENT ON COLUMN public.purchase_orders.procurement_lane IS 'V3-FIX-142: CATALOGUE_PRINCIPAL or COUNTER_PURCHASE — must never mix';
  END IF;
END $$;

-- 2. Add linked_procurement_id to purchase orders (links retailer order → supplier procurement)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'linked_procurement_id'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD COLUMN linked_procurement_id UUID;
    COMMENT ON COLUMN public.purchase_orders.linked_procurement_id IS 'V3-FIX-144: Links retailer order to upstream supplier procurement order';
  END IF;
END $$;

-- 3. Add billing_model to supplier_products (for commercialization)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'supplier_products' AND column_name = 'billing_model'
  ) THEN
    ALTER TABLE catalog.supplier_products
      ADD COLUMN billing_model VARCHAR(30) DEFAULT 'SUPERMANDI_PRINCIPAL';
    COMMENT ON COLUMN catalog.supplier_products.billing_model IS 'V3-FIX-141: Billing model for catalogue commercialization';
  END IF;
END $$;

-- 4. Add invoice_pair_id to purchase orders (links to dual invoice pair)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'invoice_pair_id'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD COLUMN invoice_pair_id UUID;
    COMMENT ON COLUMN public.purchase_orders.invoice_pair_id IS 'V3-FIX-145: Links to dual invoice pair for principal procurement';
  END IF;
END $$;

-- 5. Create invoice_dispatch_logs table for WhatsApp delivery tracking
CREATE TABLE IF NOT EXISTS public.invoice_dispatch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL,
  invoice_type VARCHAR(30) NOT NULL, -- SUPPLIER_TO_SUPERMANDI | SUPERMANDI_TO_RETAILER
  recipient_phone VARCHAR(20),
  recipient_role VARCHAR(20) NOT NULL, -- supplier | retailer | admin
  dispatched_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending_retry', -- sent | failed | pending_retry
  retry_count INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.invoice_dispatch_logs IS 'V3-FIX-145: WhatsApp dispatch tracking for dual invoices';
