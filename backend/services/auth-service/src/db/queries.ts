// Auth Service Database Queries - V3.0.9 compliant
// Queries for users, roles, and user_roles tables

import { query, queryOne } from '@supermandi/common';
import type { User, Role, UUID } from '@supermandi/common';

// =============================================================================
// USER QUERIES
// =============================================================================

// Database row types (snake_case from PostgreSQL)
interface UserRow {
  id: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  actor_type: string;
  actor_id: string | null;
  name: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  created_at: Date;
  updated_at: Date;
}

interface UserRoleRow {
  id: string;
  user_id: string;
  role_id: string;
  scope_type: string;
  scope_id: string | null;
  created_at: Date;
}

// Local UserRole type (user_roles table doesn't have updated_at)
export interface UserRoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  scopeType: 'global' | 'store' | 'supplier';
  scopeId?: string;
  createdAt: Date;
}

// Transform database row to User type
function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    passwordHash: row.password_hash ?? undefined,
    actorType: row.actor_type as User['actorType'],
    actorId: row.actor_id ?? undefined,
    name: row.name,
    status: row.status as User['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Transform database row to Role type
function rowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    permissions: row.permissions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Transform database row to UserRoleAssignment type
function rowToUserRoleAssignment(row: UserRoleRow): UserRoleAssignment {
  return {
    id: row.id,
    userId: row.user_id,
    roleId: row.role_id,
    scopeType: row.scope_type as UserRoleAssignment['scopeType'],
    scopeId: row.scope_id ?? undefined,
    createdAt: row.created_at,
  };
}

// =============================================================================
// USER CRUD
// =============================================================================

export interface CreateUserParams {
  email?: string;
  phone?: string;
  passwordHash?: string;
  actorType: 'platform' | 'store' | 'supplier';
  actorId?: UUID;
  name: string;
  status?: 'active' | 'inactive' | 'suspended';
}

export async function createUser(params: CreateUserParams): Promise<User> {
  const sql = `
    INSERT INTO auth.users (email, phone, password_hash, actor_type, actor_id, name, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  const values = [
    params.email ?? null,
    params.phone ?? null,
    params.passwordHash ?? null,
    params.actorType,
    params.actorId ?? null,
    params.name,
    params.status ?? 'active',
  ];
  const rows = await query<UserRow>(sql, values);
  const row = rows[0];
  if (!row) {
    throw new Error('Failed to create user');
  }
  return rowToUser(row);
}

export async function getUserById(id: UUID): Promise<User | null> {
  const sql = `SELECT * FROM auth.users WHERE id = $1`;
  const row = await queryOne<UserRow>(sql, [id]);
  return row ? rowToUser(row) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const sql = `SELECT * FROM auth.users WHERE email = $1`;
  const row = await queryOne<UserRow>(sql, [email]);
  return row ? rowToUser(row) : null;
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const sql = `SELECT * FROM auth.users WHERE phone = $1`;
  const row = await queryOne<UserRow>(sql, [phone]);
  return row ? rowToUser(row) : null;
}

export interface ListUsersParams {
  actorType?: 'platform' | 'store' | 'supplier';
  actorId?: UUID;
  status?: 'active' | 'inactive' | 'suspended';
  limit?: number;
  offset?: number;
}

export async function listUsers(params: ListUsersParams = {}): Promise<User[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.actorType) {
    conditions.push(`actor_type = $${paramIndex++}`);
    values.push(params.actorType);
  }
  if (params.actorId) {
    conditions.push(`actor_id = $${paramIndex++}`);
    values.push(params.actorId);
  }
  if (params.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(params.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;

  const sql = `
    SELECT * FROM auth.users
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;
  values.push(limit, offset);

  const rows = await query<UserRow>(sql, values);
  return rows.map(rowToUser);
}

export interface UpdateUserParams {
  email?: string | null;
  phone?: string | null;
  passwordHash?: string;
  name?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

export async function updateUser(id: UUID, params: UpdateUserParams): Promise<User | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.email !== undefined) {
    updates.push(`email = $${paramIndex++}`);
    values.push(params.email);
  }
  if (params.phone !== undefined) {
    updates.push(`phone = $${paramIndex++}`);
    values.push(params.phone);
  }
  if (params.passwordHash !== undefined) {
    updates.push(`password_hash = $${paramIndex++}`);
    values.push(params.passwordHash);
  }
  if (params.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(params.name);
  }
  if (params.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(params.status);
  }

  if (updates.length === 0) {
    return getUserById(id);
  }

  const sql = `
    UPDATE auth.users
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;
  values.push(id);

  const rows = await query<UserRow>(sql, values);
  const row = rows[0];
  return row ? rowToUser(row) : null;
}

export async function deleteUser(id: UUID): Promise<boolean> {
  const sql = `DELETE FROM auth.users WHERE id = $1`;
  await query(sql, [id]);
  return true;
}

// =============================================================================
// ROLE QUERIES
// =============================================================================

export async function getRoleById(id: UUID): Promise<Role | null> {
  const sql = `SELECT * FROM auth.roles WHERE id = $1`;
  const row = await queryOne<RoleRow>(sql, [id]);
  return row ? rowToRole(row) : null;
}

export async function getRoleByName(name: string): Promise<Role | null> {
  const sql = `SELECT * FROM auth.roles WHERE name = $1`;
  const row = await queryOne<RoleRow>(sql, [name]);
  return row ? rowToRole(row) : null;
}

export async function listRoles(): Promise<Role[]> {
  const sql = `SELECT * FROM auth.roles ORDER BY name`;
  const rows = await query<RoleRow>(sql);
  return rows.map(rowToRole);
}

export interface CreateRoleParams {
  name: string;
  description?: string;
  permissions: string[];
}

export async function createRole(params: CreateRoleParams): Promise<Role> {
  const sql = `
    INSERT INTO auth.roles (name, description, permissions)
    VALUES ($1, $2, $3::jsonb)
    RETURNING *
  `;
  const values = [
    params.name,
    params.description ?? null,
    JSON.stringify(params.permissions),
  ];
  const rows = await query<RoleRow>(sql, values);
  const row = rows[0];
  if (!row) {
    throw new Error('Failed to create role');
  }
  return rowToRole(row);
}

export interface UpdateRoleParams {
  description?: string;
  permissions?: string[];
}

export async function updateRole(id: UUID, params: UpdateRoleParams): Promise<Role | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(params.description);
  }
  if (params.permissions !== undefined) {
    updates.push(`permissions = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(params.permissions));
  }

  if (updates.length === 0) {
    return getRoleById(id);
  }

  const sql = `
    UPDATE auth.roles
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;
  values.push(id);

  const rows = await query<RoleRow>(sql, values);
  const row = rows[0];
  return row ? rowToRole(row) : null;
}

export async function deleteRole(id: UUID): Promise<boolean> {
  const sql = `DELETE FROM auth.roles WHERE id = $1`;
  await query(sql, [id]);
  return true;
}

// =============================================================================
// USER ROLE ASSIGNMENT QUERIES
// =============================================================================

export interface AssignRoleParams {
  userId: UUID;
  roleId: UUID;
  scopeType?: 'global' | 'store' | 'supplier';
  scopeId?: UUID;
}

export async function assignRole(params: AssignRoleParams): Promise<UserRoleAssignment> {
  const sql = `
    INSERT INTO auth.user_roles (user_id, role_id, scope_type, scope_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
  const values = [
    params.userId,
    params.roleId,
    params.scopeType ?? 'global',
    params.scopeId ?? null,
  ];
  const rows = await query<UserRoleRow>(sql, values);
  const row = rows[0];
  if (row) {
    return rowToUserRoleAssignment(row);
  }
  // If ON CONFLICT DO NOTHING triggered, return a placeholder
  return {
    id: '',
    userId: params.userId,
    roleId: params.roleId,
    scopeType: params.scopeType ?? 'global',
    scopeId: params.scopeId,
    createdAt: new Date(),
  };
}

export async function revokeRole(userId: UUID, roleId: UUID): Promise<boolean> {
  const sql = `DELETE FROM auth.user_roles WHERE user_id = $1 AND role_id = $2`;
  await query(sql, [userId, roleId]);
  return true;
}

export async function getUserRoles(userId: UUID): Promise<(UserRoleAssignment & { role: Role })[]> {
  const sql = `
    SELECT ur.*, r.name as role_name, r.description as role_description,
           r.permissions as role_permissions, r.created_at as role_created_at,
           r.updated_at as role_updated_at
    FROM auth.user_roles ur
    JOIN auth.roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
  `;
  interface JoinedRow extends UserRoleRow {
    role_name: string;
    role_description: string | null;
    role_permissions: string[];
    role_created_at: Date;
    role_updated_at: Date;
  }
  const rows = await query<JoinedRow>(sql, [userId]);
  return rows.map((row) => ({
    ...rowToUserRoleAssignment(row),
    role: {
      id: row.role_id,
      name: row.role_name,
      description: row.role_description ?? undefined,
      permissions: row.role_permissions,
      createdAt: row.role_created_at,
      updatedAt: row.role_updated_at,
    },
  }));
}

// Get all permissions for a user (aggregated from all roles)
export async function getUserPermissions(userId: UUID): Promise<string[]> {
  const sql = `
    SELECT DISTINCT jsonb_array_elements_text(r.permissions) as permission
    FROM auth.user_roles ur
    JOIN auth.roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
  `;
  interface PermRow { permission: string }
  const rows = await query<PermRow>(sql, [userId]);
  return rows.map((r) => r.permission);
}
