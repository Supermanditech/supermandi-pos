-- DEV-067: Admin Audit Log Table
-- Track all administrative actions for compliance and debugging
-- ROLLBACK: DROP TABLE IF EXISTS admin.audit_log; DROP SCHEMA IF EXISTS admin;

CREATE SCHEMA IF NOT EXISTS admin;

-- Admin audit log table
CREATE TABLE IF NOT EXISTS admin.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who
  actor_user_id UUID,
  actor_ip VARCHAR(45),
  actor_user_agent TEXT,

  -- What
  action VARCHAR(100) NOT NULL,  -- e.g., 'store.create', 'device.block', 'user.create'
  resource_type VARCHAR(50) NOT NULL,  -- e.g., 'store', 'device', 'user', 'enrollment'
  resource_id VARCHAR(100),  -- ID of the affected resource

  -- Context
  -- STG-538: store_id is intentionally nullable — audit captures global/admin-level
  -- events (superadmin login, system ops) that have no specific store context.
  store_id UUID,

  -- Data
  request_body JSONB,  -- Sanitized request body (no passwords)
  response_status INTEGER,
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying audit logs
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON admin.audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action
  ON admin.audit_log (action);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_store_id
  ON admin.audit_log (store_id) WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_resource
  ON admin.audit_log (resource_type, resource_id);

-- Comment
COMMENT ON TABLE admin.audit_log IS 'DEV-067: Audit trail for all admin/superadmin actions';
