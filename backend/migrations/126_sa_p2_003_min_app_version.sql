-- SA-P2-003: Seed minAppVersion global feature flag
-- Minimum POS app version enforcement. When enabled, devices below
-- the configured version see a mandatory update screen.
-- Default: disabled (no enforcement until admin activates).

INSERT INTO platform.feature_flags (id, flag_key, scope_type, enabled, payload_json, description, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'minAppVersion',
  'global',
  false,
  '{"version": "1.0.0"}'::jsonb,
  'Minimum POS app version required. When enabled, devices below this version see a mandatory update screen.',
  NOW(), NOW()
)
ON CONFLICT DO NOTHING;
