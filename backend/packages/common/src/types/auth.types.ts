// Auth types - V3.0.9 compliant

import { UUID, BaseEntity } from './base';

// Actor types for multi-tenant RBAC
export type ActorType = 'platform' | 'store' | 'supplier';

// User status
export type UserStatus = 'active' | 'inactive' | 'suspended';

// User entity
export interface User extends BaseEntity {
  email?: string;
  phone?: string;
  passwordHash?: string;
  actorType: ActorType;
  actorId?: UUID; // store_id or supplier_id
  name: string;
  status: UserStatus;
}

// Role entity
export interface Role extends BaseEntity {
  name: string;
  description?: string;
  permissions: string[];
}

// User role assignment
export interface UserRole extends BaseEntity {
  userId: UUID;
  roleId: UUID;
  scopeType: 'global' | 'store' | 'supplier';
  scopeId?: UUID;
}

// Device token for push notifications
export interface DeviceToken extends BaseEntity {
  userId: UUID;
  token: string;
  platform?: 'ios' | 'android' | 'web';
  isActive: boolean;
  lastUsedAt?: Date;
}

// Refresh token
export interface RefreshToken extends BaseEntity {
  userId: UUID;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
}

// JWT payload structure
export interface JwtPayload {
  userId: string;
  actorType: ActorType;
  actorId?: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

// Authenticated user context (used in request handlers)
export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  actorType: ActorType;
  actorId?: string;
  role: string;
  permissions: string[];
}

// Role names enum
export const RoleNames = {
  STORE_STAFF: 'STORE_STAFF',
  STORE_ADMIN: 'STORE_ADMIN',
  SUPPLIER_STAFF: 'SUPPLIER_STAFF',
  SUPPLIER_ADMIN: 'SUPPLIER_ADMIN',
  SUPERADMIN: 'SUPERADMIN',
} as const;

export type RoleName = (typeof RoleNames)[keyof typeof RoleNames];

// Permission definitions
export const Permissions = {
  // Inventory
  'store.inventory.read': 'View stock levels',
  'store.inventory.transaction.write': 'Record sales, GRN',
  'store.inventory.adjust.write': 'Manual adjustments',

  // Orders
  'store.orders.read': 'View purchase orders',
  'store.orders.write': 'Create, submit, receive orders',

  // Reorder
  'store.reorder.read': 'View reorder suggestions',
  'store.reorder.write': 'Approve, dismiss, set policies',

  // Catalog
  'store.catalog.read': 'Browse unified catalog',
  'store.catalog.write': 'Manage mappings',

  // Suppliers
  'store.suppliers.read': 'View linked suppliers',
  'store.suppliers.write': 'Link/unlink suppliers',

  // Feature Flags
  'store.flags.read': 'Read feature flags',

  // Supplier permissions
  'supplier.orders.read': 'View orders from stores',
  'supplier.orders.write': 'Confirm, ship, reject orders',
  'supplier.catalog.read': 'View own catalog',
  'supplier.catalog.write': 'Manage products',
  'supplier.staff.read': 'View staff',
  'supplier.staff.write': 'Manage staff',

  // Platform permissions
  'platform.stores.read': 'View all stores',
  'platform.stores.write': 'Manage stores',
  'platform.suppliers.read': 'View all suppliers',
  'platform.suppliers.write': 'Verify/manage suppliers',
  'platform.flags.read': 'View feature flags',
  'platform.flags.write': 'Manage feature flags',
} as const;

export type Permission = keyof typeof Permissions;
