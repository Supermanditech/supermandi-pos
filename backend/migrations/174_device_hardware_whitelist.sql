-- SA-P2-009: Device Hardware Whitelist
-- Allows superadmin to define allowed device hardware rules.
-- During enrollment, if any rules exist, the device must match at least one rule.

CREATE TABLE IF NOT EXISTS platform.device_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer VARCHAR(100),           -- e.g. 'Samsung' (case-insensitive match)
  model VARCHAR(100),                  -- e.g. 'Galaxy*' (supports trailing wildcard)
  min_android_version VARCHAR(10),     -- e.g. '12' (numeric >= comparison)
  notes VARCHAR(255),                  -- optional admin notes
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS device_whitelist_active_idx ON platform.device_whitelist (active) WHERE active = true;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_device_whitelist_updated_at ON platform.device_whitelist;
CREATE TRIGGER update_device_whitelist_updated_at
  BEFORE UPDATE ON platform.device_whitelist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
