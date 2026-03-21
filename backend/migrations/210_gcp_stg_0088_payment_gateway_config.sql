-- ROLLBACK: ALTER TABLE platform.stores DROP COLUMN IF EXISTS payment_gateway_config;
-- GCP-STG-0088: Payment Gateway Abstraction — per-store gateway configuration

-- Per-store gateway preference (JSON config)
-- Example: {"defaultGateway": "RAZORPAY", "enabledGateways": ["RAZORPAY", "PHONEPE"], "gatewaySettings": {...}}
ALTER TABLE platform.stores ADD COLUMN IF NOT EXISTS payment_gateway_config JSONB DEFAULT '{"defaultGateway": "UPI_DIRECT", "enabledGateways": ["UPI_DIRECT", "RAZORPAY"]}';

-- Procurement payment webhook log for audit trail (all gateways)
CREATE TABLE IF NOT EXISTS procurement.payment_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(30) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payment_intent_id UUID,
  provider_transaction_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'received',
  raw_payload JSONB,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_logs_provider ON procurement.payment_webhook_logs (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_logs_intent ON procurement.payment_webhook_logs (payment_intent_id) WHERE payment_intent_id IS NOT NULL;
