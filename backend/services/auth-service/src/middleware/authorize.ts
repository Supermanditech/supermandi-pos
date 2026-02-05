// Authorization Middleware - V3.0.9 compliant
// RBAC permission checking middleware

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError } from '@supermandi/common';
import type { ActorType, Permission } from '@supermandi/common';

/**
 * Middleware factory that requires specific permission(s)
 * Use after authenticate middleware
 *
 * @example
 * router.get('/inventory', authenticate, requirePermission('store.inventory.read'), handler)
 */
export function requirePermission(
  ...requiredPermissions: (Permission | string)[]
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }

    const userPermissions = req.user.permissions || [];

    // Check if user has ALL required permissions
    const hasAllPermissions = requiredPermissions.every((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasAllPermissions) {
      const missing = requiredPermissions.filter(
        (perm) => !userPermissions.includes(perm)
      );
      next(
        ApiError.forbidden(
          `Missing required permission(s): ${missing.join(', ')}`
        )
      );
      return;
    }

    next();
  };
}

/**
 * Middleware factory that requires ANY of the specified permissions
 *
 * @example
 * router.get('/orders', authenticate, requireAnyPermission('store.orders.read', 'supplier.orders.read'), handler)
 */
export function requireAnyPermission(
  ...requiredPermissions: (Permission | string)[]
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }

    const userPermissions = req.user.permissions || [];

    // Check if user has ANY required permission
    const hasAnyPermission = requiredPermissions.some((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasAnyPermission) {
      next(
        ApiError.forbidden(
          `Requires one of: ${requiredPermissions.join(', ')}`
        )
      );
      return;
    }

    next();
  };
}

/**
 * Middleware factory that requires specific actor type
 *
 * @example
 * router.post('/stores', authenticate, requireActorType('platform'), handler)
 */
export function requireActorType(
  ...allowedTypes: ActorType[]
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }

    if (!allowedTypes.includes(req.user.actorType)) {
      next(
        ApiError.forbidden(
          `Action requires actor type: ${allowedTypes.join(' or ')}`
        )
      );
      return;
    }

    next();
  };
}

/**
 * Middleware that requires the user to be associated with a specific store
 * Extracts storeId from params or query
 *
 * @example
 * router.get('/stores/:storeId/inventory', authenticate, requireStoreAccess, handler)
 */
export function requireStoreAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    next(ApiError.unauthorized('Authentication required'));
    return;
  }

  // Platform users have access to all stores
  if (req.user.actorType === 'platform') {
    next();
    return;
  }

  // Store users must match the storeId
  if (req.user.actorType === 'store') {
    const storeId = req.params['storeId'] || req.query['storeId'];

    if (!storeId) {
      next(ApiError.badRequest('storeId is required'));
      return;
    }

    if (req.user.actorId !== storeId) {
      next(ApiError.forbidden('Access denied to this store'));
      return;
    }

    next();
    return;
  }

  // Suppliers don't have direct store access
  next(ApiError.forbidden('Suppliers cannot access store resources directly'));
}

/**
 * Middleware that requires the user to be associated with a specific supplier
 *
 * @example
 * router.get('/suppliers/:supplierId/orders', authenticate, requireSupplierAccess, handler)
 */
export function requireSupplierAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    next(ApiError.unauthorized('Authentication required'));
    return;
  }

  // Platform users have access to all suppliers
  if (req.user.actorType === 'platform') {
    next();
    return;
  }

  // Supplier users must match the supplierId
  if (req.user.actorType === 'supplier') {
    const supplierId = req.params['supplierId'] || req.query['supplierId'];

    if (!supplierId) {
      next(ApiError.badRequest('supplierId is required'));
      return;
    }

    if (req.user.actorId !== supplierId) {
      next(ApiError.forbidden('Access denied to this supplier'));
      return;
    }

    next();
    return;
  }

  // Stores don't have direct supplier access
  next(ApiError.forbidden('Stores cannot access supplier resources directly'));
}

/**
 * Check if user has a specific permission
 * Standalone function for use in handlers
 */
export function hasPermission(req: Request, permission: Permission | string): boolean {
  if (!req.user) {
    return false;
  }
  return req.user.permissions.includes(permission);
}

/**
 * Check if user has ANY of the specified permissions
 */
export function hasAnyPermission(
  req: Request,
  ...permissions: (Permission | string)[]
): boolean {
  if (!req.user) {
    return false;
  }
  return permissions.some((perm) => req.user!.permissions.includes(perm));
}

/**
 * Check if user has ALL of the specified permissions
 */
export function hasAllPermissions(
  req: Request,
  ...permissions: (Permission | string)[]
): boolean {
  if (!req.user) {
    return false;
  }
  return permissions.every((perm) => req.user!.permissions.includes(perm));
}
