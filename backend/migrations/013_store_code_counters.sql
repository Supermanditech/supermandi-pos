-- Migration: 013_store_code_counters
-- STORECODE-001: Transaction-safe store code generation
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: platform.store_code_counters
-- Atomic sequence counters for human-readable store codes
-- Format: <PREFIX><YYMMDD>-<SEQ>  (e.g., SU260115-001)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.store_code_counters (
  -- Composite key: prefix + date
  prefix VARCHAR(2) NOT NULL,
  yymmdd VARCHAR(6) NOT NULL,

  -- Counter
  last_seq INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  PRIMARY KEY (prefix, yymmdd),
  CONSTRAINT chk_prefix_format CHECK (prefix ~ '^[A-Z]{2}$'),
  CONSTRAINT chk_yymmdd_format CHECK (yymmdd ~ '^[0-9]{6}$'),
  CONSTRAINT chk_seq_positive CHECK (last_seq >= 0)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_store_code_counters_updated_at ON platform.store_code_counters;
CREATE TRIGGER update_store_code_counters_updated_at
  BEFORE UPDATE ON platform.store_code_counters
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- =============================================================================
-- FUNCTION: platform.generate_store_code
-- Atomically generates a unique store code
-- Input: store_name TEXT
-- Output: store_code TEXT (e.g., 'SU260115-001')
-- =============================================================================
CREATE OR REPLACE FUNCTION platform.generate_store_code(store_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_letters TEXT;
  v_prefix  TEXT;
  v_yymmdd  TEXT;
  v_seq     INTEGER;
  v_code    TEXT;
BEGIN
  -- Extract only alphabetic characters, uppercase
  v_letters := UPPER(COALESCE(
    NULLIF(REGEXP_REPLACE(store_name, '[^A-Za-z]', '', 'g'), ''),
    'ST'
  ));

  -- Take first 2 letters; pad with X if fewer than 2
  IF LENGTH(v_letters) < 2 THEN
    v_prefix := RPAD(v_letters, 2, 'X');
  ELSE
    v_prefix := SUBSTRING(v_letters, 1, 2);
  END IF;

  -- Get current date in YYMMDD format
  v_yymmdd := TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD');

  -- Atomically increment or insert counter
  INSERT INTO platform.store_code_counters (prefix, yymmdd, last_seq)
  VALUES (v_prefix, v_yymmdd, 1)
  ON CONFLICT (prefix, yymmdd)
  DO UPDATE SET last_seq = platform.store_code_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  -- Format: PREFIX + YYMMDD + '-' + SEQ (3 digits, zero-padded)
  v_code := v_prefix || v_yymmdd || '-' || LPAD(v_seq::TEXT, 3, '0');

  RETURN v_code;
END;
$$;

-- =============================================================================
-- Comment function usage
-- =============================================================================
COMMENT ON FUNCTION platform.generate_store_code(TEXT) IS
'Generates a unique human-readable store code.
Format: <PREFIX><YYMMDD>-<SEQ>
Example: SU260115-001 (SuperMandi, 2026-01-15, sequence 1)
PREFIX: First 2 uppercase letters of store name (fallback: ST)
YYMMDD: Server date in IST timezone
SEQ: 3-digit sequence, resets daily per prefix';

-- =============================================================================
-- UPDATE: Add store_code column if code column needs renaming
-- Note: platform.stores already has 'code' column from migration 001
-- If you want to rename to 'store_code', use this:
-- =============================================================================
-- ALTER TABLE platform.stores RENAME COLUMN code TO store_code;
-- The existing code column already serves the purpose of store_code

-- =============================================================================
-- BACKFILL: Generate codes for any existing stores without proper format
-- NOTE: Wrapped in exception handler for idempotency on re-run
-- =============================================================================
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
  updated_count INTEGER := 0;
BEGIN
  -- Only backfill stores that don't have the new format
  FOR r IN
    SELECT id, name, code
    FROM platform.stores
    WHERE code IS NULL OR code !~ '^[A-Z]{2}[0-9]{6}-[0-9]{3}$'
  LOOP
    BEGIN
      new_code := platform.generate_store_code(COALESCE(r.name, 'Store'));
      UPDATE platform.stores SET code = new_code WHERE id = r.id;
      updated_count := updated_count + 1;
      RAISE NOTICE 'Updated store % (%) from % to %', r.id, r.name, r.code, new_code;
    EXCEPTION WHEN OTHERS THEN
      -- Skip stores that fail (already processed or edge case)
      RAISE NOTICE 'Skipped store % (%): %', r.id, r.name, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Migration 013: Updated % stores', updated_count;
END;
$$;

COMMIT;
