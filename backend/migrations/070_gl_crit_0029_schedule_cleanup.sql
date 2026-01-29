-- GL-CRIT-0029: Schedule idempotency key cleanup job
-- This migration creates a scheduled job to clean up expired idempotency keys
-- Requires pg_cron extension (installed in 000_extensions.sql)

-- Create the pg_cron extension if not exists (requires superuser in some setups)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_cron requires superuser. Will use application-level scheduler instead.';
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available: %. Will use application-level scheduler.', SQLERRM;
END;
$$;

-- GL-CRIT-0029: Create the cleanup function (idempotent - recreate if exists)
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
RETURNS TABLE(
  inventory_deleted INTEGER,
  orders_deleted INTEGER,
  reorder_deleted INTEGER,
  payments_deleted INTEGER,
  total_deleted INTEGER
) AS $$
DECLARE
  inv_count INTEGER := 0;
  ord_count INTEGER := 0;
  reo_count INTEGER := 0;
  pay_count INTEGER := 0;
BEGIN
  -- Clean inventory.idempotency_keys
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'inventory' AND table_name = 'idempotency_keys') THEN
    DELETE FROM inventory.idempotency_keys WHERE expires_at < NOW();
    GET DIAGNOSTICS inv_count = ROW_COUNT;
    RAISE NOTICE 'GL-CRIT-0029: Cleaned % expired keys from inventory.idempotency_keys', inv_count;
  END IF;

  -- Clean orders.idempotency_keys
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'orders' AND table_name = 'idempotency_keys') THEN
    DELETE FROM orders.idempotency_keys WHERE expires_at < NOW();
    GET DIAGNOSTICS ord_count = ROW_COUNT;
    RAISE NOTICE 'GL-CRIT-0029: Cleaned % expired keys from orders.idempotency_keys', ord_count;
  END IF;

  -- Clean reorder.idempotency_keys
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'reorder' AND table_name = 'idempotency_keys') THEN
    DELETE FROM reorder.idempotency_keys WHERE expires_at < NOW();
    GET DIAGNOSTICS reo_count = ROW_COUNT;
    RAISE NOTICE 'GL-CRIT-0029: Cleaned % expired keys from reorder.idempotency_keys', reo_count;
  END IF;

  -- Clean payments.idempotency_keys (if exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'payments' AND table_name = 'idempotency_keys') THEN
    DELETE FROM payments.idempotency_keys WHERE expires_at < NOW();
    GET DIAGNOSTICS pay_count = ROW_COUNT;
    RAISE NOTICE 'GL-CRIT-0029: Cleaned % expired keys from payments.idempotency_keys', pay_count;
  END IF;

  RETURN QUERY SELECT inv_count, ord_count, reo_count, pay_count, inv_count + ord_count + reo_count + pay_count;
END;
$$ LANGUAGE plpgsql;

-- Create payments.idempotency_keys table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'payments' AND table_name = 'idempotency_keys') THEN
    CREATE TABLE IF NOT EXISTS payments.idempotency_keys (
      key VARCHAR(255) PRIMARY KEY,
      response_status INTEGER,
      response_body JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
    );
    CREATE INDEX IF NOT EXISTS idx_payments_idempotency_expires_at ON payments.idempotency_keys(expires_at);
    RAISE NOTICE 'GL-CRIT-0029: Created payments.idempotency_keys table';
  END IF;
END;
$$;

-- Schedule the cleanup job (runs daily at 3 AM UTC)
-- This uses pg_cron if available
DO $$
BEGIN
  -- Check if pg_cron is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if any
    PERFORM cron.unschedule('cleanup_idempotency_keys');

    -- Schedule new job to run daily at 3 AM UTC
    PERFORM cron.schedule(
      'cleanup_idempotency_keys',
      '0 3 * * *',  -- Every day at 3:00 AM UTC
      $$SELECT * FROM public.cleanup_expired_idempotency_keys()$$
    );
    RAISE NOTICE 'GL-CRIT-0029: Scheduled daily cleanup job via pg_cron at 3 AM UTC';
  ELSE
    RAISE NOTICE 'GL-CRIT-0029: pg_cron not available. Use application-level scheduler to call cleanup_expired_idempotency_keys()';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'GL-CRIT-0029: Could not schedule pg_cron job: %. Use application-level scheduler.', SQLERRM;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.cleanup_expired_idempotency_keys() IS
'GL-CRIT-0029: Cleans up expired idempotency keys from all schemas.
Should be called daily. Returns count of deleted keys per schema.
If pg_cron is not available, call this via application-level scheduler.';
