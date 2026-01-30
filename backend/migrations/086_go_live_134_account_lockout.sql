-- GO-LIVE-134: Account lockout after failed login attempts
-- Adds failed_login_count and locked_until columns to prevent brute-force attacks
-- Applies to supplier.suppliers and auth.users tables

-- =============================================================================
-- SUPPLIER ACCOUNT LOCKOUT
-- =============================================================================

-- Add lockout fields to supplier.suppliers
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45);

-- Index for finding locked accounts (for scheduled unlock jobs if needed)
CREATE INDEX IF NOT EXISTS idx_suppliers_locked_until
  ON supplier.suppliers (locked_until)
  WHERE locked_until IS NOT NULL;

-- =============================================================================
-- AUTH.USERS ACCOUNT LOCKOUT (Retailer portal)
-- =============================================================================

-- Add lockout fields to auth.users
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45);

-- Index for finding locked accounts
CREATE INDEX IF NOT EXISTS idx_users_locked_until
  ON auth.users (locked_until)
  WHERE locked_until IS NOT NULL;

-- =============================================================================
-- HELPER FUNCTION FOR LOCKOUT LOGIC
-- Can be called from application or used in triggers
-- =============================================================================

-- Function to record a failed login attempt and potentially lock the account
CREATE OR REPLACE FUNCTION record_failed_login(
  p_table_name TEXT,    -- 'supplier.suppliers' or 'auth.users'
  p_id_column TEXT,     -- 'id' or column name
  p_id UUID,
  p_ip VARCHAR(45),
  p_max_attempts INT DEFAULT 5,
  p_lockout_minutes INT DEFAULT 30
) RETURNS TABLE(
  should_lock BOOLEAN,
  attempts_remaining INT,
  locked_until TIMESTAMPTZ
) AS $$
DECLARE
  v_current_count INT;
  v_current_locked_until TIMESTAMPTZ;
  v_new_count INT;
  v_new_locked_until TIMESTAMPTZ;
BEGIN
  -- Get current state
  EXECUTE format(
    'SELECT failed_login_count, locked_until FROM %s WHERE %s = $1',
    p_table_name, p_id_column
  ) INTO v_current_count, v_current_locked_until USING p_id;

  -- If account is currently locked and lock hasn't expired, return locked status
  IF v_current_locked_until IS NOT NULL AND v_current_locked_until > NOW() THEN
    RETURN QUERY SELECT TRUE, 0, v_current_locked_until;
    RETURN;
  END IF;

  -- Increment failed count
  v_new_count := COALESCE(v_current_count, 0) + 1;

  -- Check if we should lock
  IF v_new_count >= p_max_attempts THEN
    v_new_locked_until := NOW() + (p_lockout_minutes || ' minutes')::INTERVAL;
    EXECUTE format(
      'UPDATE %s SET failed_login_count = $1, locked_until = $2, last_failed_login_at = NOW(), last_login_ip = $3 WHERE %s = $4',
      p_table_name, p_id_column
    ) USING v_new_count, v_new_locked_until, p_ip, p_id;
    RETURN QUERY SELECT TRUE, 0, v_new_locked_until;
  ELSE
    -- Just increment counter
    EXECUTE format(
      'UPDATE %s SET failed_login_count = $1, last_failed_login_at = NOW(), last_login_ip = $2 WHERE %s = $3',
      p_table_name, p_id_column
    ) USING v_new_count, p_ip, p_id;
    RETURN QUERY SELECT FALSE, (p_max_attempts - v_new_count)::INT, NULL::TIMESTAMPTZ;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to clear failed login attempts on successful login
CREATE OR REPLACE FUNCTION clear_failed_logins(
  p_table_name TEXT,
  p_id_column TEXT,
  p_id UUID,
  p_ip VARCHAR(45)
) RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'UPDATE %s SET failed_login_count = 0, locked_until = NULL, last_login_ip = $1 WHERE %s = $2',
    p_table_name, p_id_column
  ) USING p_ip, p_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN supplier.suppliers.failed_login_count IS 'GO-LIVE-134: Number of consecutive failed login attempts';
COMMENT ON COLUMN supplier.suppliers.locked_until IS 'GO-LIVE-134: Account locked until this timestamp (NULL = not locked)';
COMMENT ON COLUMN auth.users.failed_login_count IS 'GO-LIVE-134: Number of consecutive failed login attempts';
COMMENT ON COLUMN auth.users.locked_until IS 'GO-LIVE-134: Account locked until this timestamp (NULL = not locked)';
