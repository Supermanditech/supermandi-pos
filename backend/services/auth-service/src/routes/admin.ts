// Admin Routes - PROV-002 / DEV-067
// Store user management APIs for SUPERADMIN
// These routes are SUPERADMIN only - enforced by API gateway
// DEV-067: All actions are audit logged to admin.audit_log

import { Router, Request, Response, NextFunction } from 'express';
import { ApiError } from '@supermandi/common';
import {
  createUserWithPassword,
  getUsers,
  getUser,
  updateUserDetails,
  removeUser,
  assignUserRole,
  type CreateUserInput,
  type UpdateUserInput,
} from '../services/userService';

const router: Router = Router();

// =============================================================================
// ASYNC HANDLER
// =============================================================================

type AsyncHandler<P = Record<string, string>> = (
  req: Request<P>,
  res: Response,
  next: NextFunction
) => Promise<void>;

function asyncHandler<P = Record<string, string>>(fn: AsyncHandler<P>): AsyncHandler<P> {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// ROUTE PARAMS
// =============================================================================

interface StoreIdParams {
  storeId: string;
}

interface StoreUserParams {
  storeId: string;
  userId: string;
}

// =============================================================================
// STORE USER ROUTES
// =============================================================================

/**
 * POST /admin/stores/:storeId/users
 * Create a new user for a store
 */
router.post(
  '/stores/:storeId/users',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const { storeId } = req.params;
    const { name, phone, pin, password, role } = req.body as {
      name: string;
      phone: string;
      pin?: string;
      password?: string;
      role?: 'STORE_ADMIN' | 'STAFF';
    };

    if (!name) {
      throw ApiError.badRequest('User name is required', 'name');
    }
    if (!phone) {
      throw ApiError.badRequest('Phone number is required', 'phone');
    }

    // Use PIN as password if no password provided (for store staff)
    const userPassword = password || pin;
    if (!userPassword) {
      throw ApiError.badRequest('PIN or password is required', 'pin');
    }

    // Validate PIN format if provided
    if (pin && !/^\d{4,6}$/.test(pin)) {
      throw ApiError.badRequest('PIN must be 4-6 digits', 'pin');
    }

    const input: CreateUserInput = {
      phone,
      password: userPassword,
      actorType: 'store',
      actorId: storeId,
      name,
      roleName: role || 'STORE_ADMIN',
    };

    const user = await createUserWithPassword(input);

    // Assign scoped role to store
    if (role) {
      await assignUserRole(user.id, role, 'store', storeId);
    }

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: role || 'STORE_ADMIN',
        storeId,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  })
);

/**
 * GET /admin/stores/:storeId/users
 * List all users for a store
 */
router.get(
  '/stores/:storeId/users',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const { storeId } = req.params;

    const users = await getUsers({
      actorType: 'store',
      actorId: storeId,
    });

    res.json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        status: u.status,
        createdAt: u.createdAt,
      })),
    });
  })
);

/**
 * GET /admin/stores/:storeId/users/:userId
 * Get a specific user for a store
 */
router.get(
  '/stores/:storeId/users/:userId',
  asyncHandler<StoreUserParams>(async (req, res) => {
    const { storeId, userId } = req.params;

    const user = await getUser(userId);

    // Verify user belongs to this store
    if (user.actorType !== 'store' || user.actorId !== storeId) {
      throw ApiError.notFound('User not found in this store');
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  })
);

/**
 * PATCH /admin/stores/:storeId/users/:userId
 * Update a store user
 */
router.patch(
  '/stores/:storeId/users/:userId',
  asyncHandler<StoreUserParams>(async (req, res) => {
    const { storeId, userId } = req.params;
    const { name, phone, pin, password, status } = req.body as {
      name?: string;
      phone?: string;
      pin?: string;
      password?: string;
      status?: 'active' | 'inactive' | 'suspended';
    };

    // Verify user belongs to this store
    const existingUser = await getUser(userId);
    if (existingUser.actorType !== 'store' || existingUser.actorId !== storeId) {
      throw ApiError.notFound('User not found in this store');
    }

    const updateInput: UpdateUserInput = {};
    if (name) updateInput.name = name;
    if (phone) updateInput.phone = phone;
    if (password) updateInput.password = password;
    if (pin) updateInput.password = pin;
    if (status) updateInput.status = status;

    const user = await updateUserDetails(userId, updateInput);

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        status: user.status,
        updatedAt: user.updatedAt,
      },
    });
  })
);

/**
 * DELETE /admin/stores/:storeId/users/:userId
 * Remove a store user
 */
router.delete(
  '/stores/:storeId/users/:userId',
  asyncHandler<StoreUserParams>(async (req, res) => {
    const { storeId, userId } = req.params;

    // Verify user belongs to this store
    const existingUser = await getUser(userId);
    if (existingUser.actorType !== 'store' || existingUser.actorId !== storeId) {
      throw ApiError.notFound('User not found in this store');
    }

    await removeUser(userId);

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  })
);

export default router;
