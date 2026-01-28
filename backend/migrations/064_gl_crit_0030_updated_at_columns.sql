-- GL-CRIT-0030: Add updated_at columns to transactional tables
-- Migration 064
-- These columns track when records were last modified for audit compliance

BEGIN;

-- ============================================================================
-- HELPER: Create update_updated_at_column function if not exists
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PAYMENTS SCHEMA: Add updated_at to payment tables
-- ============================================================================

-- Add updated_at to sell_payments if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'payments' AND table_name = 'sell_payments' AND column_name = 'updated_at') THEN
        ALTER TABLE payments.sell_payments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

        -- Create trigger
        CREATE TRIGGER update_sell_payments_updated_at
            BEFORE UPDATE ON payments.sell_payments
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Add updated_at to buy_payments if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'payments' AND table_name = 'buy_payments' AND column_name = 'updated_at') THEN
        ALTER TABLE payments.buy_payments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

        CREATE TRIGGER update_buy_payments_updated_at
            BEFORE UPDATE ON payments.buy_payments
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- SALES SCHEMA: Add updated_at to sale_items if not exists
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_items') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'updated_at') THEN
            ALTER TABLE public.sale_items ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

            CREATE TRIGGER update_sale_items_updated_at
                BEFORE UPDATE ON public.sale_items
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        END IF;
    END IF;
END $$;

-- Add updated_at to sales table if not exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'updated_at') THEN
            ALTER TABLE public.sales ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

            CREATE TRIGGER update_sales_updated_at
                BEFORE UPDATE ON public.sales
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        END IF;
    END IF;
END $$;

-- ============================================================================
-- ORDERS SCHEMA: Add updated_at to purchase_order_items if not exists
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'orders' AND table_name = 'purchase_order_items') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'orders' AND table_name = 'purchase_order_items' AND column_name = 'updated_at') THEN
            ALTER TABLE orders.purchase_order_items ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

            CREATE TRIGGER update_purchase_order_items_updated_at
                BEFORE UPDATE ON orders.purchase_order_items
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        END IF;
    END IF;
END $$;

COMMIT;
