// Auth Service Public Exports - V3.0.9 compliant
// Exports for use by other services

// JWT verification and utilities
export {
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  // GL-CRIT-0007: Service-to-service authentication
  generateServiceToken,
  verifyServiceToken,
} from './services/jwtService';

// Authentication middleware
export {
  authenticate,
  optionalAuthenticate,
  verifyJwt,
  getAuthUser,
} from './middleware/authenticate';

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
} from './middleware/authorize';
