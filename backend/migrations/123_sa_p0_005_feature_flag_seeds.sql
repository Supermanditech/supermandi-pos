-- SA-P0-005: Seed 7 canonical feature keys as global flags
-- Uses existing platform.feature_flags table (migration 001)
-- Default: all enabled — no disruption to existing behavior
-- Keys match ui-status features object (camelCase)

BEGIN;

INSERT INTO platform.feature_flags (flag_key, scope_type, enabled, description) VALUES
  ('buyEnabled',              'global', true, 'BUY tab — purchase ordering from suppliers'),
  ('reorderEnabled',          'global', true, 'REORDER tab — automated reorder suggestions'),
  ('voiceEnabled',            'global', true, 'Voice assistant — AI-powered voice ordering'),
  ('bnplEnabled',             'global', true, 'Buy Now Pay Later — supplier credit drawdowns'),
  ('creditEnabled',           'global', true, 'Credit/Loans — consumer credit offers'),
  ('categoryBrowsingEnabled', 'global', true, 'Category browsing rail in SELL tab'),
  ('scanLookupV2',            'global', true, 'Scan Lookup V2 — enhanced barcode resolution')
ON CONFLICT DO NOTHING;

COMMIT;
