-- Migration: 168_fix_check_constraints
-- Fixes CHECK constraint violations found during staging browser testing.
--
-- STG-099: public.sales.payment_mode — legacy chk_sale_payment_mode blocks 'SPLIT'
-- STG-149: public.sales.payment_mode — add 'CARD' for reports/daily-closing queries
-- STG-140: payments.credit_applications.status — add 'kyc_verified'
-- STG-142: payments.bnpl_drawdowns.status — add 'partial'
-- STG-143: payments.buy_payments.status — dual constraints conflict (052 vs 071)
--
-- Idempotent: uses DROP CONSTRAINT IF EXISTS throughout.

BEGIN;

-- =============================================================================
-- STG-099 + STG-149: public.sales.payment_mode
-- Problem: Migration 018 created chk_sale_payment_mode CHECK ('CASH','UPI','DUE').
--          Migration 051 tried to drop chk_payment_mode (wrong name!) and added
--          chk_payment_mode with 'SPLIT'. So TWO constraints exist:
--            1. chk_sale_payment_mode — blocks 'SPLIT' and 'CARD'
--            2. chk_payment_mode      — allows 'SPLIT' but blocks 'CARD'
-- Fix: Drop both, add single unified constraint with all needed values.
-- =============================================================================

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sale_payment_mode;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_payment_mode;

ALTER TABLE public.sales ADD CONSTRAINT chk_sale_payment_mode
  CHECK (payment_mode IS NULL OR payment_mode IN ('CASH', 'UPI', 'DUE', 'SPLIT', 'CARD'));

-- =============================================================================
-- STG-140: payments.credit_applications.status
-- Problem: Migration 049 constraint chk_credit_app_status allows
--          ('submitted','processing','approved','disbursed','rejected').
--          Backend credit.ts:546 sets status = 'kyc_verified' → crash.
-- Fix: Add 'kyc_verified' to allowed values.
-- =============================================================================

ALTER TABLE payments.credit_applications DROP CONSTRAINT IF EXISTS chk_credit_app_status;

ALTER TABLE payments.credit_applications ADD CONSTRAINT chk_credit_app_status
  CHECK (status IN ('submitted', 'processing', 'approved', 'disbursed', 'rejected', 'kyc_verified'));

-- =============================================================================
-- STG-142: payments.bnpl_drawdowns.status
-- Problem: Migration 049 constraint chk_bnpl_status allows
--          ('active','paid','overdue','defaulted').
--          Backend bnpl.ts:314 sets status = 'partial' → crash.
-- Fix: Add 'partial' to allowed values.
-- =============================================================================

ALTER TABLE payments.bnpl_drawdowns DROP CONSTRAINT IF EXISTS chk_bnpl_status;

ALTER TABLE payments.bnpl_drawdowns ADD CONSTRAINT chk_bnpl_status
  CHECK (status IN ('active', 'paid', 'overdue', 'defaulted', 'partial'));

-- =============================================================================
-- STG-143: payments.buy_payments.status (dual constraint conflict)
-- Problem: Two constraints exist simultaneously:
--   1. chk_buy_payments_status (migration 053):
--      ('pending','initiated','processing','completed','approved','failed','settled')
--   2. buy_payments_status_check (migration 071):
--      ('pending','success','failed','refunded','cancelled','settled')
--   Backend bnpl.ts:270 inserts status='initiated' → allowed by #1 but blocked by #2.
--   Backend bnpl.ts:337 sets status='completed' → allowed by #1 but blocked by #2.
-- Fix: Drop both, add single unified constraint with all values from both plus 'partial'.
-- =============================================================================

ALTER TABLE payments.buy_payments DROP CONSTRAINT IF EXISTS chk_buy_payments_status;
ALTER TABLE payments.buy_payments DROP CONSTRAINT IF EXISTS buy_payments_status_check;

ALTER TABLE payments.buy_payments ADD CONSTRAINT chk_buy_payments_status
  CHECK (status IN (
    'pending',
    'initiated',
    'processing',
    'completed',
    'approved',
    'failed',
    'settled',
    'success',
    'refunded',
    'cancelled',
    'partial'
  ));

COMMIT;
