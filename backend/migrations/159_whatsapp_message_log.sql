-- Migration: 159_whatsapp_message_log
-- WA-001: WhatsApp Business Cloud API message audit log
-- Tracks all messages sent via WhatsApp Cloud API for delivery tracking and compliance
-- Supports cross-entity messaging: POS, retailer, supplier, superadmin

BEGIN;

CREATE SCHEMA IF NOT EXISTS whatsapp;

CREATE TABLE IF NOT EXISTS whatsapp.message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID,                                       -- NULL for superadmin-sent messages
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('pos','retailer','supplier','superadmin')),
  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('consumer','retailer','supplier','superadmin')),
  recipient_phone VARCHAR(20) NOT NULL,                -- E.164 format
  message_type VARCHAR(30) NOT NULL CHECK (message_type IN ('template','text')),
  template_name VARCHAR(100),                          -- e.g. 'hello_world', 'bill_receipt'
  template_params JSONB DEFAULT '{}',
  content_preview TEXT,                                -- First 200 chars for audit
  wamid VARCHAR(200),                                  -- WhatsApp Message ID from Meta
  delivery_status VARCHAR(30) NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('queued','sent','delivered','read','failed')),
  delivery_error_code VARCHAR(50),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  context_type VARCHAR(30),                            -- 'bill_receipt','order_update','invoice','support','broadcast'
  context_id UUID,                                     -- sale_id, order_id, etc.
  sent_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Store-scoped queries
CREATE INDEX IF NOT EXISTS idx_wa_logs_store ON whatsapp.message_logs(store_id);

-- Webhook correlation (delivery status updates)
CREATE INDEX IF NOT EXISTS idx_wa_logs_wamid ON whatsapp.message_logs(wamid) WHERE wamid IS NOT NULL;

-- Recent messages per store
CREATE INDEX IF NOT EXISTS idx_wa_logs_store_created ON whatsapp.message_logs(store_id, created_at DESC);

-- Sender-type filtering for admin dashboards
CREATE INDEX IF NOT EXISTS idx_wa_logs_sender ON whatsapp.message_logs(sender_type, created_at DESC);

COMMIT;
