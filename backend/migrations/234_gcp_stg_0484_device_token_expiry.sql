-- GCP-STG-0484: Ensure POS device tokens have expiry (90-day default, auto-renewed)
-- Column token_expires_at was added in migration 044; this backfills any remaining NULLs
-- from devices created via otpAuth.ts (which previously omitted token_expires_at)
-- ROLLBACK: UPDATE pos_devices SET token_expires_at = NULL, token_refreshed_at = NULL WHERE token_expires_at IS NOT NULL;

UPDATE pos_devices
SET token_expires_at = NOW() + INTERVAL '90 days',
    token_refreshed_at = NOW()
WHERE token_expires_at IS NULL AND active = TRUE;
