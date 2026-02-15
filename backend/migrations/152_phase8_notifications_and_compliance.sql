-- Migration: 152_phase8_notifications_and_compliance
-- Phase 8: FCM Push Notifications + Payment Reminders + GST Compliance + UPI Refunds
-- Covers: T-219 (UPI refunds), T-231 (payment reminders), T-232 (GRN alert delivery), T-235 (GST compliance)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- 1. NOTIFICATIONS SCHEMA
-- Push notification system for FCM delivery to POS, retailer, supplier
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS notifications;

-- Notification log — every push/in-app notification sent
CREATE TABLE IF NOT EXISTS notifications.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL,               -- user_id from auth.users
  recipient_type VARCHAR(20) NOT NULL DEFAULT 'user',  -- 'user', 'store', 'supplier'
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',                  -- custom payload (deeplink, orderId, etc.)
  icon VARCHAR(255),
  image_url VARCHAR(500),
  notification_type VARCHAR(50) NOT NULL,   -- 'order_status', 'stock_alert', 'grn_mismatch', 'payment_reminder', 'system'
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',  -- 'high', 'normal'
  channel VARCHAR(50) DEFAULT 'default',    -- Android notification channel
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_notification_type CHECK (
    notification_type IN ('order_status', 'stock_alert', 'grn_mismatch', 'payment_reminder', 'delivery_update', 'reorder_alert', 'system', 'enrollment', 'grn_excess')
  ),
  CONSTRAINT chk_notification_priority CHECK (priority IN ('high', 'normal')),
  CONSTRAINT chk_recipient_type CHECK (recipient_type IN ('user', 'store', 'supplier'))
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION notifications.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications.notifications;
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications.notifications
  FOR EACH ROW
  EXECUTE FUNCTION notifications.update_updated_at_column();

-- Indexes for notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications.notifications (recipient_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications.notifications (notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications.notifications (recipient_id)
  WHERE is_read = false;

-- Delivery log — tracks FCM delivery status per device
CREATE TABLE IF NOT EXISTS notifications.delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications.notifications(id) ON DELETE CASCADE,
  device_token_id UUID,                     -- FK to auth.device_tokens if still active
  fcm_token VARCHAR(500) NOT NULL,          -- snapshot of token at send time
  platform VARCHAR(20),                     -- 'android', 'ios', 'web'
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'delivered', 'failed', 'bounced'
  fcm_message_id VARCHAR(255),              -- FCM response message ID
  error_code VARCHAR(100),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_delivery_status CHECK (
    status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')
  )
);

CREATE INDEX IF NOT EXISTS idx_delivery_log_notification
  ON notifications.delivery_log (notification_id);

CREATE INDEX IF NOT EXISTS idx_delivery_log_failed
  ON notifications.delivery_log (status)
  WHERE status = 'failed';

-- User notification preferences
CREATE TABLE IF NOT EXISTS notifications.preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start TIME,                   -- e.g., '22:00' IST
  quiet_hours_end TIME,                     -- e.g., '07:00' IST
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_notification_pref UNIQUE (user_id, notification_type)
);

DROP TRIGGER IF EXISTS update_notification_prefs_updated_at ON notifications.preferences;
CREATE TRIGGER update_notification_prefs_updated_at
  BEFORE UPDATE ON notifications.preferences
  FOR EACH ROW
  EXECUTE FUNCTION notifications.update_updated_at_column();


-- =============================================================================
-- 2. PAYMENT REMINDERS (T-231)
-- Tracks overdue payment reminders sent to customers
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders.payment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_name VARCHAR(255),
  total_overdue_amount INTEGER NOT NULL,     -- paise
  overdue_count INTEGER NOT NULL DEFAULT 1,  -- number of overdue payments
  oldest_due_date DATE NOT NULL,
  reminder_number INTEGER NOT NULL DEFAULT 1,  -- 1st, 2nd, 3rd reminder
  channel VARCHAR(20) NOT NULL,              -- 'sms', 'push', 'email'
  status VARCHAR(20) NOT NULL DEFAULT 'sent',  -- 'sent', 'delivered', 'failed', 'paid'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_reminder_channel CHECK (channel IN ('sms', 'push', 'email')),
  CONSTRAINT chk_reminder_status CHECK (status IN ('sent', 'delivered', 'failed', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_store
  ON orders.payment_reminders (store_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_customer
  ON orders.payment_reminders (customer_phone, store_id);


-- =============================================================================
-- 3. UPI REFUND TRACKING (T-219)
-- Tracks Razorpay refund lifecycle for UPI payments
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders.refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  payment_id UUID NOT NULL,                  -- FK to orders.payments
  sale_id UUID,                              -- Original sale
  razorpay_payment_id VARCHAR(100),          -- Razorpay payment ID
  razorpay_refund_id VARCHAR(100),           -- Razorpay refund ID (after initiation)
  refund_amount INTEGER NOT NULL,            -- paise
  reason VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'initiated',
  -- initiated → processing → completed → failed
  initiated_by UUID,                         -- user who initiated
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  razorpay_status VARCHAR(50),               -- Raw Razorpay status
  webhook_payload JSONB,                     -- Last webhook payload
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_refund_status CHECK (
    status IN ('initiated', 'processing', 'completed', 'failed', 'cancelled')
  )
);

DROP TRIGGER IF EXISTS update_refund_requests_updated_at ON orders.refund_requests;
CREATE TRIGGER update_refund_requests_updated_at
  BEFORE UPDATE ON orders.refund_requests
  FOR EACH ROW
  EXECUTE FUNCTION notifications.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_refund_requests_store
  ON orders.refund_requests (store_id, status);

CREATE INDEX IF NOT EXISTS idx_refund_requests_payment
  ON orders.refund_requests (payment_id);

CREATE INDEX IF NOT EXISTS idx_refund_requests_razorpay
  ON orders.refund_requests (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;


-- =============================================================================
-- 4. GST COMPLIANCE (T-235)
-- Monthly GST summary reports for tax filing
-- =============================================================================

CREATE TABLE IF NOT EXISTS invoicing.gst_summary_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  report_month INTEGER NOT NULL CHECK (report_month BETWEEN 1 AND 12),
  report_year INTEGER NOT NULL CHECK (report_year >= 2024),
  total_invoices INTEGER NOT NULL DEFAULT 0,
  total_taxable_amount BIGINT NOT NULL DEFAULT 0,   -- paise
  cgst_collected BIGINT NOT NULL DEFAULT 0,          -- paise
  sgst_collected BIGINT NOT NULL DEFAULT 0,          -- paise
  igst_collected BIGINT NOT NULL DEFAULT 0,          -- paise
  cess_collected BIGINT NOT NULL DEFAULT 0,          -- paise
  total_tax_collected BIGINT NOT NULL DEFAULT 0,     -- paise
  total_invoice_amount BIGINT NOT NULL DEFAULT 0,    -- paise (incl tax)
  state_breakdown JSONB DEFAULT '[]',                -- [{state, taxable, cgst, sgst, igst}]
  supplier_breakdown JSONB DEFAULT '[]',             -- [{supplierId, name, taxable, tax}]
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID,                                 -- user who generated
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_gst_report_month UNIQUE (store_id, report_month, report_year)
);

DROP TRIGGER IF EXISTS update_gst_summary_updated_at ON invoicing.gst_summary_reports;
CREATE TRIGGER update_gst_summary_updated_at
  BEFORE UPDATE ON invoicing.gst_summary_reports
  FOR EACH ROW
  EXECUTE FUNCTION notifications.update_updated_at_column();

-- Invoice archive tracking
CREATE TABLE IF NOT EXISTS invoicing.invoice_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL,
  store_id UUID NOT NULL,
  invoice_number VARCHAR(100) NOT NULL,
  invoice_type VARCHAR(50) NOT NULL,         -- 'purchase', 'sale', 'commission', 'supplier_sale'
  gcs_pdf_path VARCHAR(500),                 -- GCS path for PDF
  gcs_json_path VARCHAR(500),                -- GCS path for raw JSON
  file_size_bytes INTEGER,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_archives_store
  ON invoicing.invoice_archives (store_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_archives_invoice
  ON invoicing.invoice_archives (invoice_id);


COMMIT;
