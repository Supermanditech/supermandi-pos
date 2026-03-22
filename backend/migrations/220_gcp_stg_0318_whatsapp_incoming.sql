-- GCP-STG-0318: WhatsApp incoming message storage
-- ROLLBACK: DROP TABLE IF EXISTS whatsapp.incoming_messages;

CREATE TABLE IF NOT EXISTS whatsapp.incoming_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid VARCHAR(200) UNIQUE NOT NULL,
  from_phone VARCHAR(20) NOT NULL,
  message_type VARCHAR(30) NOT NULL DEFAULT 'text',
  text_body TEXT,
  media_id VARCHAR(200),
  timestamp_wa TIMESTAMPTZ,
  profile_name VARCHAR(200),
  context_message_id VARCHAR(200),
  raw_payload JSONB,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incoming_messages_phone
  ON whatsapp.incoming_messages (from_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incoming_messages_unprocessed
  ON whatsapp.incoming_messages (processed)
  WHERE processed = false;
