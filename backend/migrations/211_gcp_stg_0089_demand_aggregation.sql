-- ROLLBACK: DROP TABLE IF EXISTS procurement.consolidated_po_items; DROP TABLE IF EXISTS procurement.consolidated_pos;
-- GCP-STG-0089: Demand Aggregation + Supply Chain — consolidated PO tables

-- Consolidated purchase orders (bulk orders to supplier from aggregated demand)
CREATE TABLE IF NOT EXISTS procurement.consolidated_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL,
  consolidated_po_number VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'confirmed', 'dispatched', 'delivered', 'cancelled')),
  total_amount_minor BIGINT NOT NULL DEFAULT 0,
  total_items INT NOT NULL DEFAULT 0,
  store_count INT NOT NULL DEFAULT 0,
  -- Delivery tracking
  dispatched_at TIMESTAMPTZ,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  tracking_number VARCHAR(100),
  carrier VARCHAR(100),
  -- Source
  created_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Items in consolidated PO (linked back to individual store demand)
CREATE TABLE IF NOT EXISTS procurement.consolidated_po_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidated_po_id UUID NOT NULL REFERENCES procurement.consolidated_pos(id) ON DELETE CASCADE,
  supplier_product_id UUID NOT NULL,
  product_name VARCHAR(500) NOT NULL,
  total_quantity INT NOT NULL DEFAULT 0,
  unit_price_minor BIGINT NOT NULL DEFAULT 0,
  line_total_minor BIGINT NOT NULL DEFAULT 0,
  -- Per-store breakdown (which stores need this product and how much)
  store_breakdown JSONB NOT NULL DEFAULT '[]',
  -- Source purchase order IDs that this item aggregates
  source_order_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_consolidated_pos_supplier ON procurement.consolidated_pos (supplier_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consolidated_pos_status ON procurement.consolidated_pos (status) WHERE status IN ('submitted', 'confirmed', 'dispatched');
CREATE INDEX IF NOT EXISTS idx_consolidated_po_items_po ON procurement.consolidated_po_items (consolidated_po_id);
