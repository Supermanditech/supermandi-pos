-- PRA-084: Add RLS to store-scoped tables missed by migration 149
-- Tables from migrations 142, 143 (pre-149 but missed) and 150-159 (post-149)
-- Uses the same rls_store_check() function created in migration 149

-- =============================================================================
-- 1. Enable RLS on missed tables
-- =============================================================================

-- Pre-149 tables (missed by 149)
ALTER TABLE orders.purchase_cart_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.purchase_cart_drafts FORCE ROW LEVEL SECURITY;

ALTER TABLE orders.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.refunds FORCE ROW LEVEL SECURITY;

-- Post-149 tables with store_id NOT NULL
ALTER TABLE orders.payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.payment_reminders FORCE ROW LEVEL SECURITY;

ALTER TABLE payments.repayment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.repayment_schedules FORCE ROW LEVEL SECURITY;

ALTER TABLE ai.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.alerts FORCE ROW LEVEL SECURITY;

ALTER TABLE ai.demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.demand_forecasts FORCE ROW LEVEL SECURITY;

-- Post-149 tables with store_id NULLABLE (allow NULL = system/superadmin rows)
ALTER TABLE chat.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.conversations FORCE ROW LEVEL SECURITY;

ALTER TABLE whatsapp.message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp.message_logs FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. Create RLS policies (DROP IF EXISTS for idempotency)
-- =============================================================================

-- Orders schema
DROP POLICY IF EXISTS rls_purchase_cart_drafts_store ON orders.purchase_cart_drafts;
CREATE POLICY rls_purchase_cart_drafts_store ON orders.purchase_cart_drafts
  FOR ALL USING (rls_store_check(store_id));

DROP POLICY IF EXISTS rls_refunds_store ON orders.refunds;
CREATE POLICY rls_refunds_store ON orders.refunds
  FOR ALL USING (rls_store_check(store_id));

DROP POLICY IF EXISTS rls_payment_reminders_store ON orders.payment_reminders;
CREATE POLICY rls_payment_reminders_store ON orders.payment_reminders
  FOR ALL USING (rls_store_check(store_id));

-- Payments schema
DROP POLICY IF EXISTS rls_repayment_schedules_store ON payments.repayment_schedules;
CREATE POLICY rls_repayment_schedules_store ON payments.repayment_schedules
  FOR ALL USING (rls_store_check(store_id));

-- AI schema
DROP POLICY IF EXISTS rls_ai_alerts_store ON ai.alerts;
CREATE POLICY rls_ai_alerts_store ON ai.alerts
  FOR ALL USING (rls_store_check(store_id));

DROP POLICY IF EXISTS rls_ai_demand_forecasts_store ON ai.demand_forecasts;
CREATE POLICY rls_ai_demand_forecasts_store ON ai.demand_forecasts
  FOR ALL USING (rls_store_check(store_id));

-- Chat schema (nullable store_id — allow rows where store_id IS NULL)
DROP POLICY IF EXISTS rls_chat_conversations_store ON chat.conversations;
CREATE POLICY rls_chat_conversations_store ON chat.conversations
  FOR ALL USING (store_id IS NULL OR rls_store_check(store_id));

-- WhatsApp schema (nullable store_id — allow superadmin-sent messages)
DROP POLICY IF EXISTS rls_wa_message_logs_store ON whatsapp.message_logs;
CREATE POLICY rls_wa_message_logs_store ON whatsapp.message_logs
  FOR ALL USING (store_id IS NULL OR rls_store_check(store_id));
