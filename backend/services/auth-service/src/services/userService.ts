// User Service - V3.0.9 compliant
// Business logic for user management with bcrypt password hashing

import bcrypt from 'bcrypt';
import { ApiError } from '@supermandi/common';
import type { User, UUID } from '@supermandi/common';
import { config } from '../config';
import {
  createUser,
  getUserById,
  getUserByEmail,
  getUserByPhone,
  listUsers,
  updateUser,
  deleteUser,
  assignRole,
  revokeRole,
  getUserRoles,
  getUserPermissions,
  getRoleByName,
  checkUserLockout,
  recordFailedLogin,
  clearFailedLogins,
  type CreateUserParams,
  type UpdateUserParams,
  type ListUsersParams,
} from '../db/queries';

// =============================================================================
// USER CREATION
// =============================================================================

export interface CreateUserInput {
  email?: string;
  phone?: string;
  password?: string;
  actorType: 'platform' | 'store' | 'supplier';
  actorId?: UUID;
  name: string;
  roleName?: string; // Optional role to assign on creation
}

export async function createUserWithPassword(input: CreateUserInput): Promise<User> {
  // Validation
  if (!input.email && !input.phone) {
    throw ApiError.badRequest('Either email or phone is required');
  }

  // Check for existing user by email
  if (input.email) {
    const existing = await getUserByEmail(input.email);
    if (existing) {
      throw ApiError.conflict('USER_EXISTS', 'User with this email already exists');
    }
  }

  // Check for existing user by phone
  if (input.phone) {
    const existing = await getUserByPhone(input.phone);
    if (existing) {
      throw ApiError.conflict('USER_EXISTS', 'User with this phone already exists');
    }
  }

  // Validate password if provided
  let passwordHash: string | undefined;
  if (input.password) {
    if (input.password.length < config.passwordMinLength) {
      throw ApiError.badRequest(
        `Password must be at least ${config.passwordMinLength} characters`,
        'password'
      );
    }
    passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  }

  // Create user
  const params: CreateUserParams = {
    email: input.email,
    phone: input.phone,
    passwordHash,
    actorType: input.actorType,
    actorId: input.actorId,
    name: input.name,
    status: 'active',
  };

  const user = await createUser(params);

  // Assign role if specified
  if (input.roleName) {
    const role = await getRoleByName(input.roleName);
    if (role) {
      await assignRole({ userId: user.id, roleId: role.id });
    }
  }

  return user;
}

// =============================================================================
// USER RETRIEVAL
// =============================================================================

export async function getUser(id: UUID): Promise<User> {
  const user = await getUserById(id);
  if (!user) {
    throw ApiError.notFound('User');
  }
  return user;
}

export async function getUserByIdentifier(identifier: string): Promise<User | null> {
  // Try email first
  let user = await getUserByEmail(identifier);
  if (user) return user;

  // Then try phone
  user = await getUserByPhone(identifier);
  return user;
}

export async function getUsers(params: ListUsersParams = {}): Promise<User[]> {
  return listUsers(params);
}

// =============================================================================
// USER UPDATE
// =============================================================================

export interface UpdateUserInput {
  email?: string | null;
  phone?: string | null;
  password?: string;
  name?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

export async function updateUserDetails(id: UUID, input: UpdateUserInput): Promise<User> {
  // Verify user exists
  const existing = await getUserById(id);
  if (!existing) {
    throw ApiError.notFound('User');
  }

  // Check email uniqueness if changing
  if (input.email && input.email !== existing.email) {
    const emailTaken = await getUserByEmail(input.email);
    if (emailTaken) {
      throw ApiError.conflict('EMAIL_IN_USE', 'Email already in use');
    }
  }

  // Check phone uniqueness if changing
  if (input.phone && input.phone !== existing.phone) {
    const phoneTaken = await getUserByPhone(input.phone);
    if (phoneTaken) {
      throw ApiError.conflict('PHONE_IN_USE', 'Phone already in use');
    }
  }

  // Ensure at least one identifier remains
  const finalEmail = input.email !== undefined ? input.email : existing.email;
  const finalPhone = input.phone !== undefined ? input.phone : existing.phone;
  if (!finalEmail && !finalPhone) {
    throw ApiError.badRequest('User must have either email or phone');
  }

  // Hash password if provided
  let passwordHash: string | undefined;
  if (input.password) {
    if (input.password.length < config.passwordMinLength) {
      throw ApiError.badRequest(
        `Password must be at least ${config.passwordMinLength} characters`,
        'password'
      );
    }
    passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  }

  const params: UpdateUserParams = {
    email: input.email,
    phone: input.phone,
    passwordHash,
    name: input.name,
    status: input.status,
  };

  const updated = await updateUser(id, params);
  if (!updated) {
    throw ApiError.notFound('User');
  }

  return updated;
}

// =============================================================================
// USER DELETION
// =============================================================================

export async function removeUser(id: UUID): Promise<void> {
  const existing = await getUserById(id);
  if (!existing) {
    throw ApiError.notFound('User');
  }
  await deleteUser(id);
}

// =============================================================================
// PASSWORD VERIFICATION
// =============================================================================

export async function verifyPassword(userId: UUID, password: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user || !user.passwordHash) {
    return false;
  }
  return bcrypt.compare(password, user.passwordHash);
}

export async function verifyUserCredentials(
  identifier: string,
  password: string,
  ip?: string
): Promise<User | null> {
  const user = await getUserByIdentifier(identifier);
  if (!user || !user.passwordHash) {
    return null;
  }

  // AUTH-OTP-003: Check if account is locked out
  const lockedUntil = await checkUserLockout(user.id);
  if (lockedUntil) {
    const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
    throw ApiError.forbidden(
      `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    // AUTH-OTP-003: Track failed attempt
    const isNowLocked = await recordFailedLogin(user.id, ip);
    if (isNowLocked) {
      throw ApiError.forbidden(
        'Account temporarily locked due to too many failed attempts. Try again in 30 minutes.'
      );
    }
    return null;
  }

  // AUTH-OTP-003: Clear failed attempts on success
  await clearFailedLogins(user.id, ip);

  // Check user status
  if (user.status !== 'active') {
    throw ApiError.forbidden('User account is not active');
  }

  return user;
}

// =============================================================================
// ROLE MANAGEMENT
// =============================================================================

export async function assignUserRole(
  userId: UUID,
  roleName: string,
  scopeType?: 'global' | 'store' | 'supplier',
  scopeId?: UUID
): Promise<void> {
  const user = await getUserById(userId);
  if (!user) {
    throw ApiError.notFound('User');
  }

  const role = await getRoleByName(roleName);
  if (!role) {
    throw ApiError.notFound(`Role ${roleName}`);
  }

  await assignRole({ userId, roleId: role.id, scopeType, scopeId });
}

export async function revokeUserRole(userId: UUID, roleName: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) {
    throw ApiError.notFound('User');
  }

  const role = await getRoleByName(roleName);
  if (!role) {
    throw ApiError.notFound(`Role ${roleName}`);
  }

  await revokeRole(userId, role.id);
}

export async function getUserWithRoles(userId: UUID): Promise<{
  user: User;
  roles: Array<{ name: string; permissions: string[] }>;
  permissions: string[];
}> {
  const user = await getUserById(userId);
  if (!user) {
    throw ApiError.notFound('User');
  }

  const userRoles = await getUserRoles(userId);
  const permissions = await getUserPermissions(userId);

  return {
    user,
    roles: userRoles.map((ur) => ({
      name: ur.role.name,
      permissions: ur.role.permissions,
    })),
    permissions,
  };
}
