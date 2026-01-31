-- Migration: 093_go_live_batch9_retailer_portal.sql
-- GO-LIVE-263: Privacy/Terms consent columns for GDPR compliance
-- GO-LIVE-264: Support for GDPR data export endpoint

BEGIN;

-- GO-LIVE-263: Add privacy consent tracking columns to store_users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'store_users'
        AND column_name = 'privacy_accepted_at'
    ) THEN
        ALTER TABLE auth.store_users ADD COLUMN privacy_accepted_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'store_users'
        AND column_name = 'terms_accepted_at'
    ) THEN
        ALTER TABLE auth.store_users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'store_users'
        AND column_name = 'privacy_version'
    ) THEN
        ALTER TABLE auth.store_users ADD COLUMN privacy_version VARCHAR(20);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'store_users'
        AND column_name = 'terms_version'
    ) THEN
        ALTER TABLE auth.store_users ADD COLUMN terms_version VARCHAR(20);
    END IF;
END $$;

-- GO-LIVE-263: Add privacy consent tracking columns to auth.users (for standalone users)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'privacy_accepted_at'
    ) THEN
        ALTER TABLE auth.users ADD COLUMN privacy_accepted_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'terms_accepted_at'
    ) THEN
        ALTER TABLE auth.users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'privacy_version'
    ) THEN
        ALTER TABLE auth.users ADD COLUMN privacy_version VARCHAR(20);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name = 'terms_version'
    ) THEN
        ALTER TABLE auth.users ADD COLUMN terms_version VARCHAR(20);
    END IF;
END $$;

-- GO-LIVE-264: Create table for GDPR data export requests
CREATE TABLE IF NOT EXISTS auth.data_export_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES platform.stores(id) ON DELETE SET NULL,
    request_type VARCHAR(50) NOT NULL DEFAULT 'full_export', -- full_export, partial_export, deletion_request
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, expired
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    download_url TEXT,
    file_size_bytes BIGINT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Index for finding user's export requests
CREATE INDEX IF NOT EXISTS idx_data_export_requests_user_id ON auth.data_export_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_export_requests_status ON auth.data_export_requests(status);

-- Comment for documentation
COMMENT ON TABLE auth.data_export_requests IS 'GO-LIVE-264: GDPR data export request tracking for user data portability';

COMMIT;
