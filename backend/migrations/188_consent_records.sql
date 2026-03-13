-- STG-485: DPDP consent records table
-- Tracks explicit consent for PII collection (phone, PAN, address)
-- ROLLBACK: DROP TABLE IF EXISTS platform.consent_records CASCADE;

CREATE TABLE IF NOT EXISTS platform.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  customer_phone VARCHAR(15) NOT NULL,
  consent_type VARCHAR(50) NOT NULL,  -- 'credit_scoring', 'khata_phone', 'pan_collection', etc.
  given_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  ip_address VARCHAR(45),             -- For audit trail
  user_agent TEXT,                     -- For audit trail
  recorded_by UUID,                    -- Staff who recorded consent
  CONSTRAINT fk_consent_store FOREIGN KEY (store_id) REFERENCES platform.stores(id)
);

-- Index for consent lookups: "does this customer have active consent for X?"
CREATE INDEX IF NOT EXISTS idx_consent_store_phone_type
  ON platform.consent_records (store_id, customer_phone, consent_type)
  WHERE revoked_at IS NULL;

-- Index for audit: "all consents for a customer"
CREATE INDEX IF NOT EXISTS idx_consent_customer_phone
  ON platform.consent_records (customer_phone, given_at DESC);

COMMENT ON TABLE platform.consent_records IS 'DPDP Act 2023 consent audit trail — tracks when/how consent was given or revoked';
