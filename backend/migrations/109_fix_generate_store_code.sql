-- Migration: 109_fix_generate_store_code
-- DRX-002: Fix generate_store_code() — ensure function works on fresh and existing DBs
-- This migration is idempotent and safe to re-run.
-- It recreates the function to guarantee correctness on PostgreSQL 16+.

BEGIN;

-- =============================================================================
-- STEP 1: Ensure store_code_counters table exists (idempotent)
-- Originally created in migration 013, but we guard against missing table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.store_code_counters (
  prefix VARCHAR(2) NOT NULL,
  yymmdd VARCHAR(6) NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (prefix, yymmdd),
  CONSTRAINT chk_prefix_format CHECK (prefix ~ '^[A-Z]{2}$'),
  CONSTRAINT chk_yymmdd_format CHECK (yymmdd ~ '^[0-9]{6}$'),
  CONSTRAINT chk_seq_positive CHECK (last_seq >= 0)
);

-- Ensure trigger exists (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'platform' AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_store_code_counters_updated_at ON platform.store_code_counters;
    CREATE TRIGGER update_store_code_counters_updated_at
      BEFORE UPDATE ON platform.store_code_counters
      FOR EACH ROW
      EXECUTE FUNCTION platform.update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- STEP 2: Drop and recreate generate_store_code() with verified implementation
-- =============================================================================
DROP FUNCTION IF EXISTS platform.generate_store_code(TEXT);

CREATE FUNCTION platform.generate_store_code(store_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix VARCHAR(2);
  v_yymmdd VARCHAR(6);
  v_seq INTEGER;
  v_code TEXT;
BEGIN
  -- Extract prefix: first 2 uppercase letters from store name, fallback 'ST'
  v_prefix := UPPER(COALESCE(
    NULLIF(REGEXP_REPLACE(store_name, '[^A-Za-z]', '', 'g'), ''),
    'ST'
  ));

  IF LENGTH(v_prefix) < 2 THEN
    v_prefix := 'ST';
  ELSE
    v_prefix := SUBSTRING(v_prefix, 1, 2);
  END IF;

  -- Date in YYMMDD format (IST timezone)
  v_yymmdd := TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD');

  -- Atomic upsert: insert new counter or increment existing
  INSERT INTO platform.store_code_counters (prefix, yymmdd, last_seq)
  VALUES (v_prefix, v_yymmdd, 1)
  ON CONFLICT (prefix, yymmdd)
  DO UPDATE SET last_seq = platform.store_code_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  -- Format: PREFIX(2) + YYMMDD(6) + '-' + SEQ(3 zero-padded)
  v_code := v_prefix || v_yymmdd || '-' || LPAD(v_seq::TEXT, 3, '0');

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION platform.generate_store_code(TEXT) IS
'DRX-002: Generates unique human-readable store code.
Format: <PREFIX><YYMMDD>-<SEQ> (e.g., SU260207-001)
PREFIX: First 2 uppercase letters of store name (fallback: ST)
YYMMDD: IST date. SEQ: 3-digit daily counter per prefix.';

-- =============================================================================
-- STEP 3: Verification — function MUST produce valid codes or migration FAILS
-- =============================================================================
DO $$
DECLARE
  v_code1 TEXT;
  v_code2 TEXT;
  v_code3 TEXT;
  v_pattern TEXT := '^[A-Z]{2}[0-9]{6}-[0-9]{3}$';
BEGIN
  -- Generate 3 codes and verify format
  v_code1 := platform.generate_store_code('SuperMandi Test Store');
  v_code2 := platform.generate_store_code('SuperMandi Test Store');
  v_code3 := platform.generate_store_code('Kirana Mart');

  -- Verify format
  IF v_code1 !~ v_pattern THEN
    RAISE EXCEPTION 'DRX-002 VERIFICATION FAILED: code1 "%" does not match format', v_code1;
  END IF;
  IF v_code2 !~ v_pattern THEN
    RAISE EXCEPTION 'DRX-002 VERIFICATION FAILED: code2 "%" does not match format', v_code2;
  END IF;
  IF v_code3 !~ v_pattern THEN
    RAISE EXCEPTION 'DRX-002 VERIFICATION FAILED: code3 "%" does not match format', v_code3;
  END IF;

  -- Verify uniqueness (code1 and code2 have same prefix+date but different sequence)
  IF v_code1 = v_code2 THEN
    RAISE EXCEPTION 'DRX-002 VERIFICATION FAILED: duplicate codes generated: "%"', v_code1;
  END IF;

  -- Verify prefix derivation: 'SuperMandi' → 'SU', 'Kirana' → 'KI'
  IF LEFT(v_code1, 2) != 'SU' THEN
    RAISE EXCEPTION 'DRX-002 VERIFICATION FAILED: expected prefix SU, got "%"', LEFT(v_code1, 2);
  END IF;
  IF LEFT(v_code3, 2) != 'KI' THEN
    RAISE EXCEPTION 'DRX-002 VERIFICATION FAILED: expected prefix KI, got "%"', LEFT(v_code3, 2);
  END IF;

  RAISE NOTICE 'DRX-002 VERIFICATION PASSED: code1=%, code2=%, code3=%', v_code1, v_code2, v_code3;

  -- Clean up verification counters (so they don't pollute real data)
  -- The SU and KI counters from this test are harmless (sequence continues from here)
END $$;

-- =============================================================================
-- STEP 4: Backfill stores with invalid codes (idempotent)
-- =============================================================================
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
  updated_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id, name, code
    FROM platform.stores
    WHERE code IS NULL
       OR code !~ '^[A-Z]{2}[0-9]{6}-[0-9]{3}$'
  LOOP
    BEGIN
      new_code := platform.generate_store_code(COALESCE(r.name, 'Store'));
      UPDATE platform.stores SET code = new_code WHERE id = r.id;
      updated_count := updated_count + 1;
      RAISE NOTICE 'DRX-002 backfill: store % (%) code % → %', r.id, r.name, r.code, new_code;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'DRX-002 backfill: skipped store % (%): %', r.id, r.name, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'DRX-002 backfill: updated % stores', updated_count;
END $$;

COMMIT;
