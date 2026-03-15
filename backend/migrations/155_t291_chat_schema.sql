-- ROLLBACK: DROP TABLE IF EXISTS chat.message_templates; DROP TABLE IF EXISTS chat.messages; DROP TABLE IF EXISTS chat.conversation_members; DROP TABLE IF EXISTS chat.conversations; DROP SCHEMA IF EXISTS chat;
-- T-291: Chat Database Schema
-- In-app messaging: retailer ↔ supplier, support channel
-- T-301: Attachment support (message_type includes 'image', 'document')
-- T-302: Message template management (chat.message_templates table)

CREATE SCHEMA IF NOT EXISTS chat;

-- Conversations (1:1 or group)
CREATE TABLE IF NOT EXISTS chat.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('direct','group','support')),
  title VARCHAR(200),
  -- STG-538: store_id is nullable — system broadcasts and supplier-to-platform chats
  -- have no specific store context.
  store_id UUID,
  supplier_id UUID,                           -- supplier (for direct)
  created_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_store ON chat.conversations(store_id);
CREATE INDEX IF NOT EXISTS idx_conversations_supplier ON chat.conversations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON chat.conversations(last_message_at DESC);

-- Conversation participants
CREATE TABLE IF NOT EXISTS chat.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat.conversations(id),
  user_id UUID NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('retailer','supplier','admin','support')),
  display_name VARCHAR(100),
  is_muted BOOLEAN DEFAULT false,
  last_read_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_user ON chat.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_conv ON chat.conversation_participants(conversation_id);

-- Messages
CREATE TABLE IF NOT EXISTS chat.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat.conversations(id),
  sender_id UUID NOT NULL,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('retailer','supplier','admin','support','system')),
  message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','document','system','template')),
  content TEXT,                               -- text content or template body
  attachment_url TEXT,                        -- T-301: GCS URL for images/docs
  attachment_name VARCHAR(200),               -- original filename
  attachment_size INTEGER,                    -- bytes
  attachment_mime VARCHAR(100),               -- MIME type
  reply_to_id UUID REFERENCES chat.messages(id),  -- threaded replies
  metadata JSONB DEFAULT '{}',               -- template params, etc.
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON chat.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON chat.messages(sender_id);

-- T-302: Message templates (for WhatsApp + in-app system messages)
CREATE TABLE IF NOT EXISTS chat.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,         -- template identifier
  category VARCHAR(30) NOT NULL CHECK (category IN ('order_confirmation','payment_reminder','delivery_update','reorder_alert','support','custom')),
  channel VARCHAR(20) NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','whatsapp','both')),
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  body_template TEXT NOT NULL,               -- with {{variable}} placeholders
  variables TEXT[] DEFAULT ARRAY[]::TEXT[],  -- list of variable names
  is_active BOOLEAN NOT NULL DEFAULT true,
  whatsapp_template_id VARCHAR(100),         -- Meta template ID (for WhatsApp channel)
  whatsapp_status VARCHAR(20),               -- pending, approved, rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default templates
INSERT INTO chat.message_templates (name, category, channel, language, body_template, variables) VALUES
  ('order_placed', 'order_confirmation', 'both', 'en', 'Order #{{order_number}} placed successfully. Total: ₹{{amount}}. Expected delivery: {{delivery_date}}.', ARRAY['order_number','amount','delivery_date']),
  ('payment_due', 'payment_reminder', 'both', 'en', 'Payment of ₹{{amount}} for order #{{order_number}} is due on {{due_date}}. Tap to pay now.', ARRAY['order_number','amount','due_date']),
  ('delivery_shipped', 'delivery_update', 'both', 'en', 'Your order #{{order_number}} has been shipped. Track: {{tracking_url}}', ARRAY['order_number','tracking_url']),
  ('reorder_suggestion', 'reorder_alert', 'in_app', 'en', 'Low stock alert: {{product_name}} needs reorder. Suggested qty: {{quantity}}', ARRAY['product_name','quantity']),
  ('welcome_support', 'support', 'in_app', 'en', 'Welcome to SuperMandi Support! How can we help you today?', ARRAY[]::TEXT[])
ON CONFLICT (name) DO NOTHING;
