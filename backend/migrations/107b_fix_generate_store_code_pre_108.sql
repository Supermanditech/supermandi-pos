-- Migration: 107b_fix_generate_store_code_pre_108
-- CI-RECOVERY-002: Fix generate_store_code() VARCHAR(2) overflow
-- The original function (013) declares v_prefix VARCHAR(2) then assigns a
-- multi-character string before truncating, which causes PostgreSQL to throw
-- "value too long for type character varying(2)".
-- This migration MUST run before 108 to prevent the overflow.
-- Safe for existing DBs (idempotent) + fresh DBs.

BEGIN;

-- =============================================================================
-- STEP 1: Ensure store_code_counters table exists (created by 013, guard here)
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

-- =============================================================================
-- STEP 2: Drop and recreate generate_store_code() with TEXT locals
-- Key fix: ALL locals are TEXT — no VARCHAR(2) that could overflow on assignment
-- =============================================================================
DROP FUNCTION IF EXISTS platform.generate_store_code(TEXT);

CREATE FUNCTION platform.generate_store_code(store_name TEXT)
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

  -- Date component in YYMMDD format (IST timezone)
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
'CI-RECOVERY-002: Fixed version of generate_store_code (TEXT locals).
Format: <PREFIX><YYMMDD>-<SEQ> (e.g., SU260207-001)
PREFIX: First 2 uppercase letters of store name (fallback: ST, pad with X)
YYMMDD: IST date. SEQ: 3-digit daily counter per prefix.';

COMMIT;
