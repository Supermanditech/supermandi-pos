-- V3-HARDEN-189: RBAC permission seeds for Phase 21 resources
-- Resources: demand_signals (read/write), allocations (read/write)
-- Idempotent: ON CONFLICT DO NOTHING (safe to re-run)
-- ROLLBACK: DELETE FROM admin.permissions WHERE resource IN ('demand_signals', 'allocations');

INSERT INTO admin.permissions (role, resource, action, allowed) VALUES
  -- Super Admin: full access (bypassed in middleware, but seeded for completeness)
  ('super_admin', 'demand_signals', 'read', true),
  ('super_admin', 'demand_signals', 'write', true),
  ('super_admin', 'allocations', 'read', true),
  ('super_admin', 'allocations', 'write', true),
  -- Admin: read + write
  ('admin', 'demand_signals', 'read', true),
  ('admin', 'demand_signals', 'write', true),
  ('admin', 'allocations', 'read', true),
  ('admin', 'allocations', 'write', true),
  -- Moderator: read only
  ('moderator', 'demand_signals', 'read', true),
  ('moderator', 'demand_signals', 'write', false),
  ('moderator', 'allocations', 'read', true),
  ('moderator', 'allocations', 'write', false),
  -- Viewer: read only
  ('viewer', 'demand_signals', 'read', true),
  ('viewer', 'demand_signals', 'write', false),
  ('viewer', 'allocations', 'read', true),
  ('viewer', 'allocations', 'write', false)
ON CONFLICT (role, resource, action) DO NOTHING;
