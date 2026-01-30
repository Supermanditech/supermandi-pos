-- GO-LIVE-128: Admin Role-Based Access Control (RBAC)
-- Implements multi-admin support with different permission levels

BEGIN;

-- Create admin.admins table for admin user management
CREATE TABLE IF NOT EXISTS admin.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,

  -- Role: super_admin, admin, moderator, viewer
  role VARCHAR(20) NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('super_admin', 'admin', 'moderator', 'viewer')),

  -- Status: active, inactive, suspended
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),

  -- API key for authentication (hashed)
  api_key_hash VARCHAR(128),

  -- Security tracking
  last_login_at TIMESTAMPTZ,
  last_login_ip VARCHAR(45),
  failed_login_count INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES admin.admins(id)
);

-- Create index for API key lookup
CREATE INDEX IF NOT EXISTS idx_admin_admins_api_key
  ON admin.admins(api_key_hash) WHERE api_key_hash IS NOT NULL;

-- Create index for email lookup
CREATE INDEX IF NOT EXISTS idx_admin_admins_email
  ON admin.admins(email);

-- Create admin.permissions table for role permissions mapping
CREATE TABLE IF NOT EXISTS admin.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(20) NOT NULL,
  resource VARCHAR(50) NOT NULL,  -- 'stores', 'suppliers', 'products', 'users', 'devices', 'audit'
  action VARCHAR(20) NOT NULL,    -- 'read', 'create', 'update', 'delete', 'approve', 'reject'
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (role, resource, action)
);

-- Insert default permissions for each role
-- Super Admin: Full access
INSERT INTO admin.permissions (role, resource, action, allowed) VALUES
  -- Super Admin permissions (all resources, all actions)
  ('super_admin', 'stores', 'read', true),
  ('super_admin', 'stores', 'create', true),
  ('super_admin', 'stores', 'update', true),
  ('super_admin', 'stores', 'delete', true),
  ('super_admin', 'suppliers', 'read', true),
  ('super_admin', 'suppliers', 'create', true),
  ('super_admin', 'suppliers', 'update', true),
  ('super_admin', 'suppliers', 'delete', true),
  ('super_admin', 'suppliers', 'approve', true),
  ('super_admin', 'suppliers', 'reject', true),
  ('super_admin', 'products', 'read', true),
  ('super_admin', 'products', 'create', true),
  ('super_admin', 'products', 'update', true),
  ('super_admin', 'products', 'delete', true),
  ('super_admin', 'products', 'approve', true),
  ('super_admin', 'products', 'reject', true),
  ('super_admin', 'users', 'read', true),
  ('super_admin', 'users', 'create', true),
  ('super_admin', 'users', 'update', true),
  ('super_admin', 'users', 'delete', true),
  ('super_admin', 'devices', 'read', true),
  ('super_admin', 'devices', 'create', true),
  ('super_admin', 'devices', 'update', true),
  ('super_admin', 'devices', 'delete', true),
  ('super_admin', 'audit', 'read', true),
  ('super_admin', 'admins', 'read', true),
  ('super_admin', 'admins', 'create', true),
  ('super_admin', 'admins', 'update', true),
  ('super_admin', 'admins', 'delete', true),
  -- Admin permissions (most things except admin management)
  ('admin', 'stores', 'read', true),
  ('admin', 'stores', 'create', true),
  ('admin', 'stores', 'update', true),
  ('admin', 'stores', 'delete', false),
  ('admin', 'suppliers', 'read', true),
  ('admin', 'suppliers', 'create', true),
  ('admin', 'suppliers', 'update', true),
  ('admin', 'suppliers', 'delete', false),
  ('admin', 'suppliers', 'approve', true),
  ('admin', 'suppliers', 'reject', true),
  ('admin', 'products', 'read', true),
  ('admin', 'products', 'create', true),
  ('admin', 'products', 'update', true),
  ('admin', 'products', 'delete', false),
  ('admin', 'products', 'approve', true),
  ('admin', 'products', 'reject', true),
  ('admin', 'users', 'read', true),
  ('admin', 'users', 'create', true),
  ('admin', 'users', 'update', true),
  ('admin', 'users', 'delete', false),
  ('admin', 'devices', 'read', true),
  ('admin', 'devices', 'create', true),
  ('admin', 'devices', 'update', true),
  ('admin', 'devices', 'delete', false),
  ('admin', 'audit', 'read', true),
  ('admin', 'admins', 'read', true),
  ('admin', 'admins', 'create', false),
  ('admin', 'admins', 'update', false),
  ('admin', 'admins', 'delete', false),
  -- Moderator permissions (approval actions only)
  ('moderator', 'stores', 'read', true),
  ('moderator', 'stores', 'create', false),
  ('moderator', 'stores', 'update', false),
  ('moderator', 'stores', 'delete', false),
  ('moderator', 'suppliers', 'read', true),
  ('moderator', 'suppliers', 'create', false),
  ('moderator', 'suppliers', 'update', false),
  ('moderator', 'suppliers', 'delete', false),
  ('moderator', 'suppliers', 'approve', true),
  ('moderator', 'suppliers', 'reject', true),
  ('moderator', 'products', 'read', true),
  ('moderator', 'products', 'create', false),
  ('moderator', 'products', 'update', false),
  ('moderator', 'products', 'delete', false),
  ('moderator', 'products', 'approve', true),
  ('moderator', 'products', 'reject', true),
  ('moderator', 'users', 'read', true),
  ('moderator', 'users', 'create', false),
  ('moderator', 'users', 'update', false),
  ('moderator', 'users', 'delete', false),
  ('moderator', 'devices', 'read', true),
  ('moderator', 'devices', 'create', false),
  ('moderator', 'devices', 'update', false),
  ('moderator', 'devices', 'delete', false),
  ('moderator', 'audit', 'read', true),
  ('moderator', 'admins', 'read', false),
  ('moderator', 'admins', 'create', false),
  ('moderator', 'admins', 'update', false),
  ('moderator', 'admins', 'delete', false),
  -- Viewer permissions (read only)
  ('viewer', 'stores', 'read', true),
  ('viewer', 'stores', 'create', false),
  ('viewer', 'stores', 'update', false),
  ('viewer', 'stores', 'delete', false),
  ('viewer', 'suppliers', 'read', true),
  ('viewer', 'suppliers', 'create', false),
  ('viewer', 'suppliers', 'update', false),
  ('viewer', 'suppliers', 'delete', false),
  ('viewer', 'suppliers', 'approve', false),
  ('viewer', 'suppliers', 'reject', false),
  ('viewer', 'products', 'read', true),
  ('viewer', 'products', 'create', false),
  ('viewer', 'products', 'update', false),
  ('viewer', 'products', 'delete', false),
  ('viewer', 'products', 'approve', false),
  ('viewer', 'products', 'reject', false),
  ('viewer', 'users', 'read', true),
  ('viewer', 'users', 'create', false),
  ('viewer', 'users', 'update', false),
  ('viewer', 'users', 'delete', false),
  ('viewer', 'devices', 'read', true),
  ('viewer', 'devices', 'create', false),
  ('viewer', 'devices', 'update', false),
  ('viewer', 'devices', 'delete', false),
  ('viewer', 'audit', 'read', true),
  ('viewer', 'admins', 'read', false),
  ('viewer', 'admins', 'create', false),
  ('viewer', 'admins', 'update', false),
  ('viewer', 'admins', 'delete', false)
ON CONFLICT (role, resource, action) DO NOTHING;

-- Create bootstrap super admin from environment (will be created via API)
COMMENT ON TABLE admin.admins IS 'GO-LIVE-128: Admin users with RBAC roles';
COMMENT ON TABLE admin.permissions IS 'GO-LIVE-128: Permission matrix for admin roles';

COMMIT;
