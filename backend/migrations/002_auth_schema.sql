-- Migration: 002_auth_schema
-- ROLLBACK: DROP SCHEMA IF EXISTS auth CASCADE;
-- V3.0.9 Foundation: Auth schema with users, roles, tokens
-- Safe to run multiple times (idempotent)

BEGIN;

-- Create auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- =============================================================================
-- TABLE: auth.users
-- Multi-tenant users with actor-based RBAC
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Credentials (at least one required)
  email VARCHAR(255),
  phone VARCHAR(20),
  password_hash VARCHAR(255),

  -- Actor binding (multi-tenant)
  actor_type VARCHAR(20) NOT NULL DEFAULT 'store',
  actor_id UUID,  -- store_id, supplier_id, or NULL for platform

  -- Profile
  name VARCHAR(255) NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_users_actor CHECK (
    (actor_type = 'platform' AND actor_id IS NULL) OR
    (actor_type IN ('store', 'supplier') AND actor_id IS NOT NULL)
  ),
  CONSTRAINT chk_users_identifier CHECK (
    email IS NOT NULL OR phone IS NOT NULL
  ),
  CONSTRAINT chk_users_status CHECK (
    status IN ('active', 'inactive', 'suspended')
  ),
  CONSTRAINT chk_users_actor_type CHECK (
    actor_type IN ('platform', 'store', 'supplier')
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_auth_users_updated_at ON auth.users;
CREATE TRIGGER update_auth_users_updated_at
  BEFORE UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Partial unique indexes for NULL-safe uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email
  ON auth.users (email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone
  ON auth.users (phone)
  WHERE phone IS NOT NULL;

-- Index for actor lookup
CREATE INDEX IF NOT EXISTS users_actor_idx
  ON auth.users (actor_type, actor_id);

-- Index for status
CREATE INDEX IF NOT EXISTS users_status_idx
  ON auth.users (status);

-- =============================================================================
-- TABLE: auth.roles
-- Role definitions with permissions as JSONB array
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Role identification
  name VARCHAR(50) NOT NULL,
  description VARCHAR(500),

  -- Permissions (stored as JSONB array of permission strings)
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT roles_name_unique UNIQUE (name)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_auth_roles_updated_at ON auth.roles;
CREATE TRIGGER update_auth_roles_updated_at
  BEFORE UPDATE ON auth.roles
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- =============================================================================
-- TABLE: auth.user_roles
-- User-role assignments with optional scope
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,

  -- Scope for role assignment
  scope_type VARCHAR(20) NOT NULL DEFAULT 'global',
  scope_id UUID,  -- NULL for global, store_id or supplier_id for scoped

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_user_roles_scope CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type IN ('store', 'supplier') AND scope_id IS NOT NULL)
  )
);

-- Partial unique index for global roles (one per user + role)
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_global
  ON auth.user_roles (user_id, role_id)
  WHERE scope_type = 'global';

-- Partial unique index for scoped roles (one per user + role + scope)
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_scoped
  ON auth.user_roles (user_id, role_id, scope_type, scope_id)
  WHERE scope_type != 'global';

-- Index for user lookup
CREATE INDEX IF NOT EXISTS user_roles_user_idx
  ON auth.user_roles (user_id);

-- Index for role lookup
CREATE INDEX IF NOT EXISTS user_roles_role_idx
  ON auth.user_roles (role_id);

-- =============================================================================
-- TABLE: auth.device_tokens
-- Push notification tokens per user device
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Token data
  token VARCHAR(500) NOT NULL,
  platform VARCHAR(20),  -- 'ios', 'android', 'web'

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_device_platform CHECK (
    platform IS NULL OR platform IN ('ios', 'android', 'web')
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_auth_device_tokens_updated_at ON auth.device_tokens;
CREATE TRIGGER update_auth_device_tokens_updated_at
  BEFORE UPDATE ON auth.device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Unique token (each token can only belong to one user)
CREATE UNIQUE INDEX IF NOT EXISTS ux_device_tokens_token
  ON auth.device_tokens (token);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS device_tokens_user_idx
  ON auth.device_tokens (user_id);

-- Index for active tokens
CREATE INDEX IF NOT EXISTS device_tokens_active_idx
  ON auth.device_tokens (user_id)
  WHERE is_active = true;

-- =============================================================================
-- TABLE: auth.refresh_tokens
-- JWT refresh tokens with revocation support
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Token (stored as hash for security)
  token_hash VARCHAR(255) NOT NULL,

  -- Expiry and revocation
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,

  -- Metadata
  user_agent VARCHAR(500),
  ip_address VARCHAR(45),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique token hash
CREATE UNIQUE INDEX IF NOT EXISTS ux_refresh_tokens_hash
  ON auth.refresh_tokens (token_hash);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx
  ON auth.refresh_tokens (user_id);

-- Index for cleanup (expired tokens)
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx
  ON auth.refresh_tokens (expires_at)
  WHERE revoked_at IS NULL;

-- =============================================================================
-- TABLE: auth.password_reset_tokens
-- Password reset tokens with expiry
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Token (stored as hash for security)
  token_hash VARCHAR(255) NOT NULL,

  -- Expiry and usage
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique token hash
CREATE UNIQUE INDEX IF NOT EXISTS ux_password_reset_tokens_hash
  ON auth.password_reset_tokens (token_hash);

-- Index for user lookup (latest first)
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON auth.password_reset_tokens (user_id, created_at DESC);

-- =============================================================================
-- SEED: Default roles with permissions
-- =============================================================================

-- STORE_STAFF: Basic store operations
INSERT INTO auth.roles (name, description, permissions) VALUES (
  'STORE_STAFF',
  'Store staff with basic POS and inventory operations',
  '["store.inventory.read", "store.inventory.transaction.write", "store.orders.read", "store.catalog.read", "store.suppliers.read", "store.reorder.read", "store.flags.read"]'::jsonb
) ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

-- STORE_ADMIN: Full store management
INSERT INTO auth.roles (name, description, permissions) VALUES (
  'STORE_ADMIN',
  'Store administrator with full store management permissions',
  '["store.inventory.read", "store.inventory.transaction.write", "store.inventory.adjust.write", "store.orders.read", "store.orders.write", "store.catalog.read", "store.catalog.write", "store.suppliers.read", "store.suppliers.write", "store.reorder.read", "store.reorder.write", "store.flags.read"]'::jsonb
) ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

-- SUPPLIER_STAFF: Basic supplier operations
INSERT INTO auth.roles (name, description, permissions) VALUES (
  'SUPPLIER_STAFF',
  'Supplier staff with basic order and catalog operations',
  '["supplier.orders.read", "supplier.catalog.read"]'::jsonb
) ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

-- SUPPLIER_ADMIN: Full supplier management
INSERT INTO auth.roles (name, description, permissions) VALUES (
  'SUPPLIER_ADMIN',
  'Supplier administrator with full supplier management permissions',
  '["supplier.orders.read", "supplier.orders.write", "supplier.catalog.read", "supplier.catalog.write", "supplier.staff.read", "supplier.staff.write"]'::jsonb
) ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

-- SUPERADMIN: Platform-wide access
INSERT INTO auth.roles (name, description, permissions) VALUES (
  'SUPERADMIN',
  'Platform superadmin with full system access',
  '["platform.stores.read", "platform.stores.write", "platform.suppliers.read", "platform.suppliers.write", "platform.flags.read", "platform.flags.write", "store.inventory.read", "store.inventory.transaction.write", "store.inventory.adjust.write", "store.orders.read", "store.orders.write", "store.catalog.read", "store.catalog.write", "store.suppliers.read", "store.suppliers.write", "store.reorder.read", "store.reorder.write", "store.flags.read", "supplier.orders.read", "supplier.orders.write", "supplier.catalog.read", "supplier.catalog.write", "supplier.staff.read", "supplier.staff.write"]'::jsonb
) ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

COMMIT;
