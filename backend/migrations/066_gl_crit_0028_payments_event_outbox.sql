-- GL-CRIT-0028: Add payments event outbox for eventual consistency
-- Migration 066
-- Creates an event outbox table in the payments schema for reliable event publishing

BEGIN;

-- ============================================================================
-- PAYMENTS EVENT OUTBOX TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments.event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event metadata
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL DEFAULT 'payment',
    aggregate_id VARCHAR(100) NOT NULL,

    -- Event payload (JSON)
    payload JSONB NOT NULL,

    -- Processing status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'published', 'failed')),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,

    -- Retry tracking
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,

    -- Idempotency for event processing
    idempotency_key VARCHAR(255)
);

-- Create indexes for efficient processing
CREATE INDEX IF NOT EXISTS idx_payments_outbox_status_created
    ON payments.event_outbox(status, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payments_outbox_aggregate
    ON payments.event_outbox(aggregate_type, aggregate_id);

-- Add comment
COMMENT ON TABLE payments.event_outbox IS
'GL-CRIT-0028: Event outbox for reliable payment event publishing.
Follows the transactional outbox pattern for eventual consistency.';

-- ============================================================================
-- HELPER FUNCTION: Publish payment event to outbox
-- ============================================================================
CREATE OR REPLACE FUNCTION payments.publish_event(
    p_event_type VARCHAR(100),
    p_aggregate_id VARCHAR(100),
    p_payload JSONB,
    p_idempotency_key VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO payments.event_outbox (event_type, aggregate_id, payload, idempotency_key)
    VALUES (p_event_type, p_aggregate_id, p_payload, p_idempotency_key)
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
