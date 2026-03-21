-- GCP-STG-0113: Invoice template + WhatsApp dispatch policy per store
-- ROLLBACK: ALTER TABLE platform.stores DROP COLUMN IF EXISTS invoice_settings;

ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS invoice_settings JSONB NOT NULL DEFAULT '{
    "logoUrl": null,
    "headerText": null,
    "footerText": "Thank you for your business!",
    "termsAndConditions": null,
    "showGstin": true,
    "showHsn": true,
    "autoSendWhatsApp": false,
    "autoSendOnSale": false,
    "autoSendOnPo": false,
    "autoSendOnGrn": false
  }'::jsonb;

COMMENT ON COLUMN platform.stores.invoice_settings IS 'GCP-STG-0113: Per-store invoice template + WhatsApp dispatch policy (editable by SuperAdmin)';
