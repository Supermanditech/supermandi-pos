-- Migration: 187_sale_items_batch_number
-- SCALE-A3: Add batch_number to sale_items for end-to-end batch traceability
-- PRE-F-001: Additive only — existing rows get NULL (correct default)

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);

CREATE INDEX IF NOT EXISTS sale_items_batch_number_idx
  ON public.sale_items (batch_number)
  WHERE batch_number IS NOT NULL;
