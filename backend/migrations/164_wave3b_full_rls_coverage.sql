-- Migration: 164_wave3b_full_rls_coverage
-- WAVE3B: Production-grade RLS coverage for ALL store-scoped tables.
-- After migration 163, all store_id columns are UUID — rls_store_check() works.
--
-- Existing coverage: 39 tables (M149: 27, M161: 11, M162: 1)
-- This migration adds RLS to ~27 remaining store-scoped tables.
--
-- Fixes: #371 (complete RLS coverage)

BEGIN;

-- =============================================================================
-- Helper: Enable RLS + FORCE + create policy (idempotent)
-- =============================================================================

-- Standard policy for tables with store_id UUID NOT NULL
-- Uses rls_store_check() from migration 149.

-- =============================================================================
-- GROUP 1: Public schema tables (V1 runtime tables, now UUID after M163)
-- =============================================================================

-- pos_devices (store_id UUID after M163)
ALTER TABLE pos_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pos_devices_store ON pos_devices;
CREATE POLICY rls_pos_devices_store ON pos_devices
  FOR ALL USING (store_id IS NULL OR rls_store_check(store_id));

-- pos_device_enrollments (store_id UUID after M163)
ALTER TABLE pos_device_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_device_enrollments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pos_device_enrollments_store ON pos_device_enrollments;
CREATE POLICY rls_pos_device_enrollments_store ON pos_device_enrollments
  FOR ALL USING (rls_store_check(store_id));

-- scan_events (store_id UUID after M163)
DO $$ BEGIN
  ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE scan_events FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_scan_events_store ON scan_events;
  CREATE POLICY rls_scan_events_store ON scan_events
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- pos_events (store_id UUID after M163)
DO $$ BEGIN
  ALTER TABLE pos_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pos_events FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_pos_events_store ON pos_events;
  CREATE POLICY rls_pos_events_store ON pos_events
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- retailer_variants (store_id UUID after M163)
DO $$ BEGIN
  ALTER TABLE retailer_variants ENABLE ROW LEVEL SECURITY;
  ALTER TABLE retailer_variants FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_retailer_variants_store ON retailer_variants;
  CREATE POLICY rls_retailer_variants_store ON retailer_variants
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- accounts_receivable (store_id UUID after M163)
DO $$ BEGIN
  ALTER TABLE accounts_receivable ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounts_receivable FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_accounts_receivable_store ON accounts_receivable;
  CREATE POLICY rls_accounts_receivable_store ON accounts_receivable
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- failed_sync_events (store_id UUID after M163)
DO $$ BEGIN
  ALTER TABLE failed_sync_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE failed_sync_events FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_failed_sync_events_store ON failed_sync_events;
  CREATE POLICY rls_failed_sync_events_store ON failed_sync_events
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- public.store_products M104 (store_id UUID after M163)
-- Note: catalog.store_products already has RLS from M149. This is the M104 public table.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_products'
    AND column_name = 'store_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.store_products FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rls_public_store_products_store ON public.store_products;
    CREATE POLICY rls_public_store_products_store ON public.store_products
      FOR ALL USING (rls_store_check(store_id));
  END IF;
END $$;

-- public.store_inventory M104
DO $$ BEGIN
  ALTER TABLE public.store_inventory ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.store_inventory FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_store_inventory_store ON public.store_inventory;
  CREATE POLICY rls_store_inventory_store ON public.store_inventory
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- public.inventory_ledger M106 (not the same as inventory.inventory_ledger)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_ledger'
    AND column_name = 'store_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.inventory_ledger FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rls_public_inventory_ledger_store ON public.inventory_ledger;
    CREATE POLICY rls_public_inventory_ledger_store ON public.inventory_ledger
      FOR ALL USING (rls_store_check(store_id));
  END IF;
END $$;

-- device_activation_codes (bound_store_id, nullable)
DO $$ BEGIN
  ALTER TABLE device_activation_codes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE device_activation_codes FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_device_activation_codes_store ON device_activation_codes;
  CREATE POLICY rls_device_activation_codes_store ON device_activation_codes
    FOR ALL USING (bound_store_id IS NULL OR rls_store_check(bound_store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- customers
DO $$ BEGIN
  ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE customers FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_customers_store ON customers;
  CREATE POLICY rls_customers_store ON customers
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- device_enrollment_events
DO $$ BEGIN
  ALTER TABLE device_enrollment_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE device_enrollment_events FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_device_enrollment_events_store ON device_enrollment_events;
  CREATE POLICY rls_device_enrollment_events_store ON device_enrollment_events
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- sync_event_failures
DO $$ BEGIN
  ALTER TABLE sync_event_failures ENABLE ROW LEVEL SECURITY;
  ALTER TABLE sync_event_failures FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_sync_event_failures_store ON sync_event_failures;
  CREATE POLICY rls_sync_event_failures_store ON sync_event_failures
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- api_idempotency_keys
DO $$ BEGIN
  ALTER TABLE api_idempotency_keys ENABLE ROW LEVEL SECURITY;
  ALTER TABLE api_idempotency_keys FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_api_idempotency_keys_store ON api_idempotency_keys;
  CREATE POLICY rls_api_idempotency_keys_store ON api_idempotency_keys
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- payments (public schema, M40/M72)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
    AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rls_payments_store ON public.payments;
    CREATE POLICY rls_payments_store ON public.payments
      FOR ALL USING (store_id IS NULL OR rls_store_check(store_id));
  END IF;
END $$;

-- =============================================================================
-- GROUP 2: Platform schema
-- =============================================================================

-- platform.store_staff
DO $$ BEGIN
  ALTER TABLE platform.store_staff ENABLE ROW LEVEL SECURITY;
  ALTER TABLE platform.store_staff FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_store_staff_store ON platform.store_staff;
  CREATE POLICY rls_store_staff_store ON platform.store_staff
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- platform.store_status_audit
DO $$ BEGIN
  ALTER TABLE platform.store_status_audit ENABLE ROW LEVEL SECURITY;
  ALTER TABLE platform.store_status_audit FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_store_status_audit_store ON platform.store_status_audit;
  CREATE POLICY rls_store_status_audit_store ON platform.store_status_audit
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- platform.csv_imports
DO $$ BEGIN
  ALTER TABLE platform.csv_imports ENABLE ROW LEVEL SECURITY;
  ALTER TABLE platform.csv_imports FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_csv_imports_store ON platform.csv_imports;
  CREATE POLICY rls_csv_imports_store ON platform.csv_imports
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- platform.impersonation_logs (uses target_store_id)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'impersonation_logs'
    AND column_name = 'target_store_id'
  ) THEN
    ALTER TABLE platform.impersonation_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE platform.impersonation_logs FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rls_impersonation_logs_store ON platform.impersonation_logs;
    CREATE POLICY rls_impersonation_logs_store ON platform.impersonation_logs
      FOR ALL USING (rls_store_check(target_store_id));
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- GROUP 3: Catalog schema
-- =============================================================================

-- catalog.translation_quotas
DO $$ BEGIN
  ALTER TABLE catalog.translation_quotas ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalog.translation_quotas FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_translation_quotas_store ON catalog.translation_quotas;
  CREATE POLICY rls_translation_quotas_store ON catalog.translation_quotas
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- catalog.store_product_barcodes
DO $$ BEGIN
  ALTER TABLE catalog.store_product_barcodes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalog.store_product_barcodes FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_store_product_barcodes_store ON catalog.store_product_barcodes;
  CREATE POLICY rls_store_product_barcodes_store ON catalog.store_product_barcodes
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- catalog.store_category_overrides
DO $$ BEGIN
  ALTER TABLE catalog.store_category_overrides ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalog.store_category_overrides FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_store_category_overrides_store ON catalog.store_category_overrides;
  CREATE POLICY rls_store_category_overrides_store ON catalog.store_category_overrides
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- GROUP 4: Inventory schema
-- =============================================================================

-- inventory.physical_counts
DO $$ BEGIN
  ALTER TABLE inventory.physical_counts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE inventory.physical_counts FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_physical_counts_store ON inventory.physical_counts;
  CREATE POLICY rls_physical_counts_store ON inventory.physical_counts
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- GROUP 5: Orders schema
-- =============================================================================

-- orders.khata_entries
DO $$ BEGIN
  ALTER TABLE orders.khata_entries ENABLE ROW LEVEL SECURITY;
  ALTER TABLE orders.khata_entries FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_khata_entries_store ON orders.khata_entries;
  CREATE POLICY rls_khata_entries_store ON orders.khata_entries
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- GROUP 6: Payments schema
-- =============================================================================

-- payments.bnpl_drawdowns
DO $$ BEGIN
  ALTER TABLE payments.bnpl_drawdowns ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments.bnpl_drawdowns FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_bnpl_drawdowns_store ON payments.bnpl_drawdowns;
  CREATE POLICY rls_bnpl_drawdowns_store ON payments.bnpl_drawdowns
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- payments.credit_offers
DO $$ BEGIN
  ALTER TABLE payments.credit_offers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments.credit_offers FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_credit_offers_store ON payments.credit_offers;
  CREATE POLICY rls_credit_offers_store ON payments.credit_offers
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- payments.credit_applications
DO $$ BEGIN
  ALTER TABLE payments.credit_applications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments.credit_applications FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_credit_applications_store ON payments.credit_applications;
  CREATE POLICY rls_credit_applications_store ON payments.credit_applications
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- payments.customer_dues
DO $$ BEGIN
  ALTER TABLE payments.customer_dues ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments.customer_dues FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_customer_dues_store ON payments.customer_dues;
  CREATE POLICY rls_customer_dues_store ON payments.customer_dues
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- payments.upi_verifications
DO $$ BEGIN
  ALTER TABLE payments.upi_verifications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments.upi_verifications FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_upi_verifications_store ON payments.upi_verifications;
  CREATE POLICY rls_upi_verifications_store ON payments.upi_verifications
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- payments.kyc_documents
DO $$ BEGIN
  ALTER TABLE payments.kyc_documents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments.kyc_documents FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_kyc_documents_store ON payments.kyc_documents;
  CREATE POLICY rls_kyc_documents_store ON payments.kyc_documents
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- payments.credit_settlements
DO $$ BEGIN
  ALTER TABLE payments.credit_settlements ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments.credit_settlements FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_credit_settlements_store ON payments.credit_settlements;
  CREATE POLICY rls_credit_settlements_store ON payments.credit_settlements
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- payments.bnpl_disputes
DO $$ BEGIN
  ALTER TABLE payments.bnpl_disputes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments.bnpl_disputes FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_bnpl_disputes_store ON payments.bnpl_disputes;
  CREATE POLICY rls_bnpl_disputes_store ON payments.bnpl_disputes
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- GROUP 7: AI schema
-- =============================================================================

-- ai.auto_closing_config (store_id is PRIMARY KEY)
DO $$ BEGIN
  ALTER TABLE ai.auto_closing_config ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ai.auto_closing_config FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_auto_closing_config_store ON ai.auto_closing_config;
  CREATE POLICY rls_auto_closing_config_store ON ai.auto_closing_config
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ai.customer_insights
DO $$ BEGIN
  ALTER TABLE ai.customer_insights ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ai.customer_insights FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_customer_insights_store ON ai.customer_insights;
  CREATE POLICY rls_customer_insights_store ON ai.customer_insights
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ai.anomaly_events
DO $$ BEGIN
  ALTER TABLE ai.anomaly_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ai.anomaly_events FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_anomaly_events_store ON ai.anomaly_events;
  CREATE POLICY rls_anomaly_events_store ON ai.anomaly_events
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ai.product_recommendations
DO $$ BEGIN
  ALTER TABLE ai.product_recommendations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ai.product_recommendations FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_product_recommendations_store ON ai.product_recommendations;
  CREATE POLICY rls_product_recommendations_store ON ai.product_recommendations
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- GROUP 8: Invoicing schema
-- =============================================================================

-- invoicing.gst_summary_reports
DO $$ BEGIN
  ALTER TABLE invoicing.gst_summary_reports ENABLE ROW LEVEL SECURITY;
  ALTER TABLE invoicing.gst_summary_reports FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_gst_summary_reports_store ON invoicing.gst_summary_reports;
  CREATE POLICY rls_gst_summary_reports_store ON invoicing.gst_summary_reports
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- invoicing.invoice_archives
DO $$ BEGIN
  ALTER TABLE invoicing.invoice_archives ENABLE ROW LEVEL SECURITY;
  ALTER TABLE invoicing.invoice_archives FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_invoice_archives_store ON invoicing.invoice_archives;
  CREATE POLICY rls_invoice_archives_store ON invoicing.invoice_archives
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- GROUP 9: Auth schema
-- =============================================================================

-- auth.store_users
DO $$ BEGIN
  ALTER TABLE auth.store_users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE auth.store_users FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_store_users_store ON auth.store_users;
  CREATE POLICY rls_store_users_store ON auth.store_users
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- auth.token_revocations
DO $$ BEGIN
  ALTER TABLE auth.token_revocations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE auth.token_revocations FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_token_revocations_store ON auth.token_revocations;
  CREATE POLICY rls_token_revocations_store ON auth.token_revocations
    FOR ALL USING (rls_store_check(store_id));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

COMMIT;
