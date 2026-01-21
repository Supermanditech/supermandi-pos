// SEC-ADMIN-001: Admin Authentication Middleware for API Gateway
// Protects /api/v1/admin/* routes with x-admin-token header check

import { Request, Response, NextFunction } from 'express';

// =============================================================================
// CONFIGURATION
// =============================================================================

const ADMIN_TOKEN = process.env['ADMIN_TOKEN']?.trim();

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Admin Authentication Middleware
 *
 * Protects /api/v1/admin/* routes by requiring a valid x-admin-token header.
 * This ensures only superadmin users can access admin endpoints.
 *
 * Proof requirements:
 * - curl without token → 401
 * - curl with invalid token → 403
 * - curl with valid admin token → passes through (200 from backend)
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only apply to admin routes
  if (!req.path.startsWith('/api/v1/admin')) {
    return next();
  }

  // Check if ADMIN_TOKEN is configured
  if (!ADMIN_TOKEN) {
    console.error('[ADMIN-AUTH] ADMIN_TOKEN env var not set - admin APIs disabled');
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Admin APIs are not configured',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // Get token from header
  const token = req.headers['x-admin-token'];
  const tokenStr = Array.isArray(token) ? token[0] : token;

  if (!tokenStr) {
    console.log(`[ADMIN-AUTH] ${req.method} ${req.path} - Missing x-admin-token header`);
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing x-admin-token header. Admin authentication required.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // Verify token
  if (tokenStr.trim() !== ADMIN_TOKEN) {
    console.log(`[ADMIN-AUTH] ${req.method} ${req.path} - Invalid admin token`);
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid admin token. Access denied.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // Token is valid - allow request to proceed
  console.log(`[ADMIN-AUTH] ${req.method} ${req.path} - Admin authenticated`);
  next();
}
