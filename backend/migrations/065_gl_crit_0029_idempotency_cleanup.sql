-- GL-CRIT-0029: Add idempotency keys cleanup function
-- Migration 065
-- Creates a function to clean up expired idempotency keys to prevent unbounded table growth

BEGIN;

-- ============================================================================
-- CLEANUP FUNCTION: Delete expired idempotency keys from all schemas
-- This function should be called periodically (e.g., daily via cron)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS TABLE(out_schema_name TEXT, out_table_name TEXT, out_rows_deleted BIGINT) AS $$
DECLARE
    del_count BIGINT;
BEGIN
    -- Clean inventory.idempotency_keys
    IF EXISTS (SELECT 1 FROM information_schema.tables t
               WHERE t.table_schema = 'inventory' AND t.table_name = 'idempotency_keys') THEN
        DELETE FROM inventory.idempotency_keys WHERE expires_at < NOW();
        GET DIAGNOSTICS del_count = ROW_COUNT;
        out_schema_name := 'inventory';
        out_table_name := 'idempotency_keys';
        out_rows_deleted := del_count;
        RETURN NEXT;
    END IF;

    -- Clean orders.idempotency_keys
    IF EXISTS (SELECT 1 FROM information_schema.tables t
               WHERE t.table_schema = 'orders' AND t.table_name = 'idempotency_keys') THEN
        DELETE FROM orders.idempotency_keys WHERE expires_at < NOW();
        GET DIAGNOSTICS del_count = ROW_COUNT;
        out_schema_name := 'orders';
        out_table_name := 'idempotency_keys';
        out_rows_deleted := del_count;
        RETURN NEXT;
    END IF;

    -- Clean reorder.idempotency_keys
    IF EXISTS (SELECT 1 FROM information_schema.tables t
               WHERE t.table_schema = 'reorder' AND t.table_name = 'idempotency_keys') THEN
        DELETE FROM reorder.idempotency_keys WHERE expires_at < NOW();
        GET DIAGNOSTICS del_count = ROW_COUNT;
        out_schema_name := 'reorder';
        out_table_name := 'idempotency_keys';
        out_rows_deleted := del_count;
        RETURN NEXT;
    END IF;

    -- Clean payments.idempotency_keys if exists
    IF EXISTS (SELECT 1 FROM information_schema.tables t
               WHERE t.table_schema = 'payments' AND t.table_name = 'idempotency_keys') THEN
        DELETE FROM payments.idempotency_keys WHERE expires_at < NOW();
        GET DIAGNOSTICS del_count = ROW_COUNT;
        out_schema_name := 'payments';
        out_table_name := 'idempotency_keys';
        out_rows_deleted := del_count;
        RETURN NEXT;
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INDEXES: Add indexes on expires_at for efficient cleanup queries
-- ============================================================================
DO $$
BEGIN
    -- Index on inventory.idempotency_keys.expires_at
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'inventory' AND table_name = 'idempotency_keys' AND column_name = 'expires_at') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes
                       WHERE schemaname = 'inventory' AND tablename = 'idempotency_keys' AND indexname = 'idx_inventory_idempotency_expires_at') THEN
            CREATE INDEX idx_inventory_idempotency_expires_at ON inventory.idempotency_keys(expires_at);
        END IF;
    END IF;

    -- Index on orders.idempotency_keys.expires_at
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'orders' AND table_name = 'idempotency_keys' AND column_name = 'expires_at') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes
                       WHERE schemaname = 'orders' AND tablename = 'idempotency_keys' AND indexname = 'idx_orders_idempotency_expires_at') THEN
            CREATE INDEX idx_orders_idempotency_expires_at ON orders.idempotency_keys(expires_at);
        END IF;
    END IF;

    -- Index on reorder.idempotency_keys.expires_at
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'reorder' AND table_name = 'idempotency_keys' AND column_name = 'expires_at') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes
                       WHERE schemaname = 'reorder' AND tablename = 'idempotency_keys' AND indexname = 'idx_reorder_idempotency_expires_at') THEN
            CREATE INDEX idx_reorder_idempotency_expires_at ON reorder.idempotency_keys(expires_at);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- COMMENT: Usage instructions
-- ============================================================================
COMMENT ON FUNCTION cleanup_expired_idempotency_keys() IS
'GL-CRIT-0029: Cleanup function for expired idempotency keys.
Call periodically: SELECT * FROM cleanup_expired_idempotency_keys();
Recommended: Run daily via pg_cron or application-level cron job.';

COMMIT;
