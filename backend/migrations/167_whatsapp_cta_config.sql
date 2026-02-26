-- REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001
-- WhatsApp CTA live configuration table
-- Allows superadmin to update landing page WhatsApp numbers without a code deploy.
-- Single-row table (id=1 always). Admin UI writes via PUT /admin/whatsapp/cta-config.
-- Landing page reads via GET /api/v1/public/whatsapp-cta-config (no auth).

CREATE TABLE IF NOT EXISTS platform.whatsapp_cta_config (
    id                  SERIAL PRIMARY KEY,
    enabled             BOOLEAN      NOT NULL DEFAULT true,
    superadmin_number   VARCHAR(20)  NOT NULL DEFAULT '919251893684',
    superadmin_message  TEXT         NOT NULL DEFAULT 'Hi! I need help with my SuperMandi account or platform setup.',
    company_number      VARCHAR(20)  NOT NULL DEFAULT '919251893684',
    company_message     TEXT         NOT NULL DEFAULT 'Hi! I''d like to learn more about SuperMandi and partnership opportunities.',
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by          VARCHAR(255)
);

-- Single-row seed: insert only if table is empty
INSERT INTO platform.whatsapp_cta_config
    (enabled, superadmin_number, superadmin_message, company_number, company_message)
SELECT
    true,
    '919251893684',
    'Hi! I need help with my SuperMandi account or platform setup.',
    '919251893684',
    'Hi! I''d like to learn more about SuperMandi and partnership opportunities.'
WHERE NOT EXISTS (SELECT 1 FROM platform.whatsapp_cta_config);
