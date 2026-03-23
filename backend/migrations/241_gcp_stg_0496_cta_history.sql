-- GCP-STG-0496: CTA config change history
-- ROLLBACK: DROP TABLE IF EXISTS platform.whatsapp_cta_config_history;
CREATE TABLE IF NOT EXISTS platform.whatsapp_cta_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_snapshot JSONB NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
