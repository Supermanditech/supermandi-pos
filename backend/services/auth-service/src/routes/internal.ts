// Internal Routes - V3.0.9 compliant
// Routes for service-to-service communication (no public auth required)

import { Router, Request, Response, NextFunction } from 'express';
import { ApiError } from '@supermandi/common';
import {
  createUserWithPassword,
  getUser,
  getUsers,
  updateUserDetails,
  removeUser,
  verifyUserCredentials,
  assignUserRole,
  revokeUserRole,
  getUserWithRoles,
  type CreateUserInput,
  type UpdateUserInput,
} from '../services/userService';
import {
  getRole,
  getAllRoles,
  createNewRole,
  updateRoleDetails,
  removeRole,
  getAllPermissions,
  type CreateRoleInput,
  type UpdateRoleInput,
} from '../services/roleService';

const router: Router = Router();

// =============================================================================
// ROUTE PARAM TYPES
// =============================================================================

interface IdParams {
  id: string;
}

interface UserRoleParams {
  id: string;
  roleName: string;
}

// =============================================================================
// ERROR HANDLER WRAPPER
// =============================================================================

type AsyncHandler<P = Record<string, string>> = (
  req: Request<P>,
  res: Response,
  next: NextFunction
) => Promise<void>;

function asyncHandler<P = Record<string, string>>(fn: AsyncHandler<P>) {
  return async (req: Request<P>, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// USER ROUTES
// =============================================================================

// Create user
router.post(
  '/users',
  asyncHandler(async (req: Request, res: Response) => {
    const input: CreateUserInput = req.body;
    const user = await createUserWithPassword(input);
    res.status(201).json({ data: user });
  })
);

// List users
router.get(
  '/users',
  asyncHandler(async (req: Request, res: Response) => {
    const { actorType, actorId, status, limit, offset } = req.query;
    const users = await getUsers({
      actorType: actorType as 'platform' | 'store' | 'supplier' | undefined,
      actorId: actorId as string | undefined,
      status: status as 'active' | 'inactive' | 'suspended' | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json({ data: users });
  })
);

// Get user by ID
router.get(
  '/users/:id',
  asyncHandler<IdParams>(async (req, res) => {
    const user = await getUser(req.params.id);
    res.json({ data: user });
  })
);

// Get user with roles
router.get(
  '/users/:id/roles',
  asyncHandler<IdParams>(async (req, res) => {
    const result = await getUserWithRoles(req.params.id);
    res.json({ data: result });
  })
);

// Update user
router.patch(
  '/users/:id',
  asyncHandler<IdParams>(async (req, res) => {
    const input: UpdateUserInput = req.body;
    const user = await updateUserDetails(req.params.id, input);
    res.json({ data: user });
  })
);

// Delete user
router.delete(
  '/users/:id',
  asyncHandler<IdParams>(async (req, res) => {
    await removeUser(req.params.id);
    res.status(204).send();
  })
);

// Verify credentials (for auth service to validate login)
router.post(
  '/users/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      throw ApiError.badRequest('identifier and password required');
    }
    const user = await verifyUserCredentials(identifier, password);
    if (!user) {
      throw ApiError.unauthorized('Invalid credentials');
    }
    // Return user with roles for JWT generation
    const result = await getUserWithRoles(user.id);
    res.json({ data: result });
  })
);

// =============================================================================
// USER ROLE ASSIGNMENT ROUTES
// =============================================================================

// Assign role to user
router.post(
  '/users/:id/roles',
  asyncHandler<IdParams>(async (req, res) => {
    const { roleName, scopeType, scopeId } = req.body;
    if (!roleName) {
      throw ApiError.badRequest('roleName is required', 'roleName');
    }
    await assignUserRole(req.params.id, roleName, scopeType, scopeId);
    res.status(201).json({ message: 'Role assigned successfully' });
  })
);

// Revoke role from user
router.delete(
  '/users/:id/roles/:roleName',
  asyncHandler<UserRoleParams>(async (req, res) => {
    await revokeUserRole(req.params.id, req.params.roleName);
    res.status(204).send();
  })
);

// =============================================================================
// ROLE ROUTES
// =============================================================================

// List all roles
router.get(
  '/roles',
  asyncHandler(async (_req: Request, res: Response) => {
    const roles = await getAllRoles();
    res.json({ data: roles });
  })
);

// Get role by ID
router.get(
  '/roles/:id',
  asyncHandler<IdParams>(async (req, res) => {
    const role = await getRole(req.params.id);
    res.json({ data: role });
  })
);

// Create role
router.post(
  '/roles',
  asyncHandler(async (req: Request, res: Response) => {
    const input: CreateRoleInput = req.body;
    const role = await createNewRole(input);
    res.status(201).json({ data: role });
  })
);

// Update role
router.patch(
  '/roles/:id',
  asyncHandler<IdParams>(async (req, res) => {
    const input: UpdateRoleInput = req.body;
    const role = await updateRoleDetails(req.params.id, input);
    res.json({ data: role });
  })
);

// Delete role
router.delete(
  '/roles/:id',
  asyncHandler<IdParams>(async (req, res) => {
    await removeRole(req.params.id);
    res.status(204).send();
  })
);

// =============================================================================
// PERMISSION ROUTES
// =============================================================================

// List all available permissions
router.get(
  '/permissions',
  asyncHandler(async (_req: Request, res: Response) => {
    const permissions = getAllPermissions();
    res.json({ data: permissions });
  })
);

export default router;
