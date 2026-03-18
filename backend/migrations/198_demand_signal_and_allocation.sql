-- V3-HARDEN-166: Schema for store-demand visibility and supplier-trigger orchestration
-- ROLLBACK: DROP TABLE IF EXISTS public.supplier_demand_allocations; DROP TABLE IF EXISTS public.lifecycle_event_log; ALTER TABLE orders.purchase_orders DROP COLUMN IF EXISTS allocation_status;

-- 1. Supplier demand allocation records (V3-FIX-164)
CREATE TABLE IF NOT EXISTS public.supplier_demand_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_order_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  store_id UUID NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_trigger',
  triggered_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_allocation_status CHECK (status IN (
    'pending_trigger', 'triggered', 'accepted', 'partial_accepted',
    'rejected', 'dispatched', 'delivered', 'grn_completed'
  ))
);

COMMENT ON TABLE public.supplier_demand_allocations IS 'V3-FIX-164: Links retailer demand to supplier procurement allocation';

CREATE INDEX IF NOT EXISTS idx_sda_retailer_order ON public.supplier_demand_allocations (retailer_order_id);
CREATE INDEX IF NOT EXISTS idx_sda_supplier ON public.supplier_demand_allocations (supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_sda_store ON public.supplier_demand_allocations (store_id, status);

-- 2. Lifecycle event log for communication fan-out (V3-HARDEN-165)
CREATE TABLE IF NOT EXISTS public.lifecycle_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(40) NOT NULL,
  order_id UUID,
  store_id UUID,
  supplier_id UUID,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_lifecycle_event_type CHECK (event_type IN (
    'order_created', 'supplier_action_required', 'supplier_accepted',
    'supplier_rejected', 'partial_accept', 'dispatched',
    'delivery_due', 'delivered', 'grn_completed', 'repeat_order_prompt'
  ))
);

COMMENT ON TABLE public.lifecycle_event_log IS 'V3-HARDEN-165: Append-only lifecycle events for communication fan-out';

CREATE INDEX IF NOT EXISTS idx_lel_order ON public.lifecycle_event_log (order_id);
CREATE INDEX IF NOT EXISTS idx_lel_store ON public.lifecycle_event_log (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lel_event_type ON public.lifecycle_event_log (event_type, created_at DESC);

-- 3. Add allocation_status to purchase_orders for quick lookup
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'orders' AND table_name = 'purchase_orders' AND column_name = 'allocation_status'
  ) THEN
    ALTER TABLE orders.purchase_orders ADD COLUMN allocation_status VARCHAR(30);
    COMMENT ON COLUMN orders.purchase_orders.allocation_status IS 'V3-FIX-164: Current supplier allocation status';
  END IF;
END $$;
