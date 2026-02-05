// Auth Service Middleware - V3.0.9 compliant
// Exports for internal use and other services

// Authentication middleware
export {
  authenticate,
  optionalAuthenticate,
  verifyJwt,
  getAuthUser,
} from './authenticate';

// Authorization middleware
export {
  requirePermission,
  requireAnyPermission,
  requireActorType,
  requireStoreAccess,
  requireSupplierAccess,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from './authorize';
