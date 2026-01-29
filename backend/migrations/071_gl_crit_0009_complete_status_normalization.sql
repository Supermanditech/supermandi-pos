-- GL-CRIT-0009: Complete status value normalization
-- This migration addresses the public.payments table that was missed in migration 067
-- Normalizes all status values to lowercase for consistency

-- Check if public.payments table exists and normalize its status values
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    -- Check if status column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'status') THEN
      -- Update existing data to lowercase
      UPDATE public.payments SET status = LOWER(status) WHERE status <> LOWER(status);
      RAISE NOTICE 'GL-CRIT-0009: Normalized public.payments status values to lowercase';

      -- Drop existing constraint if any
      BEGIN
        ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
      EXCEPTION WHEN undefined_object THEN
        NULL;
      END;

      -- Add new constraint with lowercase only values
      ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
        CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled'));
      RAISE NOTICE 'GL-CRIT-0009: Added lowercase-only constraint to public.payments.status';
    END IF;
  ELSE
    RAISE NOTICE 'GL-CRIT-0009: public.payments table does not exist - skipping';
  END IF;
END;
$$;

-- Ensure payments.sell_payments and payments.buy_payments have lowercase constraints
DO $$
BEGIN
  -- payments.sell_payments
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'payments' AND table_name = 'sell_payments') THEN
    -- Update existing data
    UPDATE payments.sell_payments SET status = LOWER(status) WHERE status <> LOWER(status);

    -- Drop and recreate constraint
    BEGIN
      ALTER TABLE payments.sell_payments DROP CONSTRAINT IF EXISTS sell_payments_status_check;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;

    ALTER TABLE payments.sell_payments ADD CONSTRAINT sell_payments_status_check
      CHECK (status IN ('pending', 'success', 'failed', 'refunded', 'cancelled'));
    RAISE NOTICE 'GL-CRIT-0009: Normalized payments.sell_payments status constraint';
  END IF;

  -- payments.buy_payments
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'payments' AND table_name = 'buy_payments') THEN
    -- Update existing data
    UPDATE payments.buy_payments SET status = LOWER(status) WHERE status <> LOWER(status);

    -- Drop and recreate constraint
    BEGIN
      ALTER TABLE payments.buy_payments DROP CONSTRAINT IF EXISTS buy_payments_status_check;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;

    ALTER TABLE payments.buy_payments ADD CONSTRAINT buy_payments_status_check
      CHECK (status IN ('pending', 'success', 'failed', 'refunded', 'cancelled', 'settled'));
    RAISE NOTICE 'GL-CRIT-0009: Normalized payments.buy_payments status constraint';
  END IF;
END;
$$;

-- Ensure orders.purchase_orders has lowercase constraint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'orders' AND table_name = 'purchase_orders') THEN
    -- Update existing data
    UPDATE orders.purchase_orders SET status = LOWER(status) WHERE status <> LOWER(status);

    -- Drop and recreate constraint
    BEGIN
      ALTER TABLE orders.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;

    ALTER TABLE orders.purchase_orders ADD CONSTRAINT purchase_orders_status_check
      CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'partial'));
    RAISE NOTICE 'GL-CRIT-0009: Normalized orders.purchase_orders status constraint';
  END IF;
END;
$$;

-- Add comment for documentation
COMMENT ON SCHEMA public IS 'GL-CRIT-0009: All status columns normalized to lowercase for consistency';
