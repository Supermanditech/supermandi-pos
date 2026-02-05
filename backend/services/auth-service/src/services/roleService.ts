// Role Service - V3.0.9 compliant
// Business logic for role management

import { ApiError, Permissions } from '@supermandi/common';
import type { Role, UUID } from '@supermandi/common';
import {
  getRoleById,
  getRoleByName,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  type CreateRoleParams,
  type UpdateRoleParams,
} from '../db/queries';

// =============================================================================
// ROLE RETRIEVAL
// =============================================================================

export async function getRole(id: UUID): Promise<Role> {
  const role = await getRoleById(id);
  if (!role) {
    throw ApiError.notFound('Role');
  }
  return role;
}

export async function getRoleByIdentifier(identifier: string): Promise<Role> {
  // Try by name first (more common)
  let role = await getRoleByName(identifier);
  if (role) return role;

  // Then try by ID
  role = await getRoleById(identifier);
  if (!role) {
    throw ApiError.notFound('Role');
  }
  return role;
}

export async function getAllRoles(): Promise<Role[]> {
  return listRoles();
}

// =============================================================================
// ROLE CREATION
// =============================================================================

export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export async function createNewRole(input: CreateRoleInput): Promise<Role> {
  // Validate name uniqueness
  const existing = await getRoleByName(input.name);
  if (existing) {
    throw ApiError.conflict('ROLE_EXISTS', `Role ${input.name} already exists`);
  }

  // Validate permissions
  const validPermissions = Object.keys(Permissions);
  const invalidPermissions = input.permissions.filter(
    (p) => !validPermissions.includes(p)
  );
  if (invalidPermissions.length > 0) {
    throw ApiError.badRequest(
      `Invalid permissions: ${invalidPermissions.join(', ')}`
    );
  }

  const params: CreateRoleParams = {
    name: input.name,
    description: input.description,
    permissions: input.permissions,
  };

  return createRole(params);
}

// =============================================================================
// ROLE UPDATE
// =============================================================================

export interface UpdateRoleInput {
  description?: string;
  permissions?: string[];
}

export async function updateRoleDetails(id: UUID, input: UpdateRoleInput): Promise<Role> {
  // Verify role exists
  const existing = await getRoleById(id);
  if (!existing) {
    throw ApiError.notFound('Role');
  }

  // Validate permissions if provided
  if (input.permissions) {
    const validPermissions = Object.keys(Permissions);
    const invalidPermissions = input.permissions.filter(
      (p) => !validPermissions.includes(p)
    );
    if (invalidPermissions.length > 0) {
      throw ApiError.badRequest(
        `Invalid permissions: ${invalidPermissions.join(', ')}`
      );
    }
  }

  const params: UpdateRoleParams = {
    description: input.description,
    permissions: input.permissions,
  };

  const updated = await updateRole(id, params);
  if (!updated) {
    throw ApiError.notFound('Role');
  }

  return updated;
}

// =============================================================================
// ROLE DELETION
// =============================================================================

// Default roles that cannot be deleted
const PROTECTED_ROLES = [
  'STORE_STAFF',
  'STORE_ADMIN',
  'SUPPLIER_STAFF',
  'SUPPLIER_ADMIN',
  'SUPERADMIN',
];

export async function removeRole(id: UUID): Promise<void> {
  const existing = await getRoleById(id);
  if (!existing) {
    throw ApiError.notFound('Role');
  }

  // Prevent deletion of default roles
  if (PROTECTED_ROLES.includes(existing.name)) {
    throw ApiError.forbidden(`Cannot delete protected role ${existing.name}`);
  }

  await deleteRole(id);
}

// =============================================================================
// PERMISSION UTILITIES
// =============================================================================

export function getAllPermissions(): Array<{
  permission: string;
  description: string;
}> {
  return Object.entries(Permissions).map(([permission, description]) => ({
    permission,
    description,
  }));
}

export function validatePermissions(permissions: string[]): {
  valid: boolean;
  invalid: string[];
} {
  const validPermissions = Object.keys(Permissions);
  const invalid = permissions.filter((p) => !validPermissions.includes(p));
  return {
    valid: invalid.length === 0,
    invalid,
  };
}
