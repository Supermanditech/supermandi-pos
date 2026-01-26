// JWT Authentication Middleware for API Gateway
// Verifies JWT tokens and sets x-user-id, x-actor-id headers for downstream services

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// =============================================================================
// TYPES
// =============================================================================

interface JwtPayload {
  sub: string;        // User ID
  actorType: string;  // 'STORE', 'PLATFORM', 'SUPPLIER'
  actorId: string;    // Store ID, etc.
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
}

// Extend Express Request to include JWT claims
declare global {
  namespace Express {
    interface Request {
      jwtPayload?: JwtPayload;
    }
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const JWT_SECRET = process.env['JWT_SECRET'] || 'dev-secret-change-in-prod';
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';

// Routes that don't require JWT authentication
// Only auth endpoints are public - all other routes require valid JWT
const PUBLIC_PATHS = [
  '/api/v1/retailer-admin/auth/firebase-login',
  '/api/v1/retailer-admin/auth/refresh',
  '/api/v1/retailer-admin/health',  // RCAT-DEPLOY-001: Gateway routing verification
  '/health',
  '/healthz',
];

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * JWT Authentication Middleware
 *
 * For protected routes:
 * 1. Extracts JWT from Authorization header
 * 2. Verifies JWT signature and expiry
 * 3. Sets x-user-id and x-actor-id headers for downstream services
 *
 * Public routes (listed in PUBLIC_PATHS) bypass authentication.
 */
export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if this is a public path
  const isPublicPath = PUBLIC_PATHS.some(path => req.path.startsWith(path));
  if (isPublicPath) {
    return next();
  }

  // Only apply to retailer-admin routes (except auth which is public)
  if (!req.path.startsWith('/api/v1/retailer-admin')) {
    return next();
  }

  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  console.log(`[JWT-DEBUG] ${req.method} ${req.path} - Auth header: ${authHeader ? `"${authHeader.substring(0, 50)}..."` : 'MISSING'}`);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`[JWT-DEBUG] Rejecting: No valid Bearer token`);
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header. Use Bearer <token>.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    console.log(`[JWT-DEBUG] Verifying token (len=${token.length}), secret preview: ${JWT_SECRET.substring(0, 10)}..., issuer: ${JWT_ISSUER}`);

    // Verify and decode the token
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
    }) as JwtPayload;

    // Store decoded payload on request for logging/debugging
    req.jwtPayload = decoded;

    // Validate required claims
    if (!decoded.sub || !decoded.actorId || !decoded.actorType) {
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token missing required claims (sub, actorId, actorType).',
        },
        requestId: req.correlationId,
      });
      return;
    }

    // Set headers for downstream services
    // These headers are trusted because they come from the gateway
    req.headers['x-user-id'] = decoded.sub;
    req.headers['x-actor-id'] = decoded.actorId;
    req.headers['x-actor-type'] = decoded.actorType;
    req.headers['x-permissions'] = JSON.stringify(decoded.permissions);

    // Log authenticated request
    console.log(
      `[AUTH] ${req.method} ${req.path} - User: ${decoded.sub}, Actor: ${decoded.actorId}`
    );

    next();
  } catch (error) {
    console.log(`[JWT-DEBUG] Verification FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);

    if (error instanceof jwt.TokenExpiredError) {
      console.log(`[JWT-DEBUG] Token expired at: ${error.expiredAt}`);
      res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired. Please refresh your token.',
        },
        requestId: req.correlationId,
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      console.log(`[JWT-DEBUG] JsonWebTokenError: ${error.message}`);
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token. Please login again.',
        },
        requestId: req.correlationId,
      });
      return;
    }

    // Unknown error
    console.error('[AUTH ERROR]', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication error',
      },
      requestId: req.correlationId,
    });
  }
}

/**
 * Middleware to reject any client-provided x-user-id/x-actor-id headers
 * This prevents clients from spoofing their identity
 * Must be applied BEFORE jwtAuthMiddleware
 */
export function stripClientAuthHeaders(req: Request, _res: Response, next: NextFunction): void {
  // Remove any client-provided auth headers to prevent spoofing
  delete req.headers['x-user-id'];
  delete req.headers['x-actor-id'];
  delete req.headers['x-actor-type'];
  delete req.headers['x-permissions'];
  next();
}
