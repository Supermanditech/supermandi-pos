// AUTH-GATEWAY-001 + AUTH-PERM-001: Centralized actor type enforcement
// Defense-in-depth: gateway validates actor type per route namespace
// Backend services also validate permissions (fine-grained)

import { Request, Response, NextFunction } from 'express';

// =============================================================================
// ACTOR TYPE POLICY
// =============================================================================
// Maps route prefixes to allowed actor types.
// Only enforced for JWT-authenticated requests (req.jwtPayload present).
// Order matters: more specific prefixes must come first.
// =============================================================================

interface RoutePolicy {
  prefix: string;
  allowedActorTypes: string[];
}

const ROUTE_ACTOR_POLICY: RoutePolicy[] = [
  // Retailer portal - only store actors
  { prefix: '/api/v1/retailer-admin/', allowedActorTypes: ['store'] },
  // Supplier portal - only supplier actors
  { prefix: '/api/v1/supplier/', allowedActorTypes: ['supplier'] },
  // Platform management - only platform (superadmin) actors
  { prefix: '/api/v1/platform/', allowedActorTypes: ['platform'] },
  // Supplier management (plural) - only platform actors
  { prefix: '/api/v1/suppliers/', allowedActorTypes: ['platform'] },
  // Inventory - store or platform
  { prefix: '/api/v1/inventory/', allowedActorTypes: ['store', 'platform'] },
  // Orders - store or platform
  { prefix: '/api/v1/orders/', allowedActorTypes: ['store', 'platform'] },
  // Catalog - store, supplier, or platform
  { prefix: '/api/v1/catalog/', allowedActorTypes: ['store', 'supplier', 'platform'] },
  // Reorder - store or platform
  { prefix: '/api/v1/reorder/', allowedActorTypes: ['store', 'platform'] },
  // Voice - store or platform
  { prefix: '/api/v1/voice/', allowedActorTypes: ['store', 'platform'] },
  // Documents - any authenticated user
  { prefix: '/api/v1/documents/', allowedActorTypes: ['store', 'supplier', 'platform'] },
];

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Actor type enforcement middleware.
 *
 * Checks that the JWT actor type matches the allowed types for the route.
 * Only runs for JWT-authenticated requests (req.jwtPayload set by jwtAuth).
 * Routes without a matching policy pass through (POS, admin, health, etc.).
 */
export function actorTypeMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only enforce for JWT-authenticated requests
  if (!req.jwtPayload) {
    return next();
  }

  const actorType = req.jwtPayload.actorType?.toLowerCase();
  if (!actorType) {
    return next();
  }

  // Find matching policy for this route
  const policy = ROUTE_ACTOR_POLICY.find(p => req.path.startsWith(p.prefix));
  if (!policy) {
    // No policy defined — allow through (admin, POS, auth, health, etc.)
    return next();
  }

  // Check if actor type is allowed for this route namespace
  if (!policy.allowedActorTypes.includes(actorType)) {
    console.warn(
      `[AUTH-PERM-001] Cross-portal access BLOCKED: ` +
      `actorType=${actorType}, path=${req.path}, ` +
      `userId=${req.jwtPayload.sub}, allowed=${policy.allowedActorTypes.join(',')}`
    );
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  next();
}
