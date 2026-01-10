-- Migration: Add missing indexes for performance optimization
-- Date: 2026-01-10
-- Description: Add indexes on foreign keys and frequently queried columns to improve query performance

-- Add index on sale_items.sale_id for faster JOIN queries with sales table
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items (sale_id);

-- Add index on sale_items.variant_id for faster variant lookup queries
CREATE INDEX IF NOT EXISTS sale_items_variant_id_idx ON sale_items (variant_id);

-- Add index on retailer_variants.variant_id for faster product availability checks
CREATE INDEX IF NOT EXISTS retailer_variants_variant_id_idx ON retailer_variants (variant_id);

-- Add composite index on pos_devices (store_id, active) for faster device listing per store
CREATE INDEX IF NOT EXISTS pos_devices_store_id_active_idx ON pos_devices (store_id, active);

-- Add index on inventory_ledger (store_id, global_product_id, created_at) for audit queries
CREATE INDEX IF NOT EXISTS inventory_ledger_store_product_time_idx ON inventory_ledger (store_id, global_product_id, created_at DESC);

-- Add index on sales (store_id, created_at) for sales history queries
CREATE INDEX IF NOT EXISTS sales_store_id_created_at_idx ON sales (store_id, created_at DESC);

-- Add index on scan_events (store_id, device_id, created_at) for event analytics
CREATE INDEX IF NOT EXISTS scan_events_store_device_time_idx ON scan_events (store_id, device_id, created_at DESC);
