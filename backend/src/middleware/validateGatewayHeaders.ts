// GO-LIVE-046: Validate Gateway Headers Middleware
// Ensures retailer-admin routes have valid gateway-provided headers
// Defense-in-depth: validates JWT even though gateway already verified it

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { log } from "../lib/logger";

// =============================================================================
// CONFIGURATION
// =============================================================================

// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'
const JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET']?.trim();
  if (!secret) {
    const env = (process.env.NODE_ENV || '').toLowerCase();
    if (env === 'development' || env === 'test') {
      return 'dev-secret-change-in-prod';
    }
    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');
    process.exit(1);
  }
  return secret;
})();

const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';

// =============================================================================
// TYPES
// =============================================================================

interface JwtPayload {
  sub: string;        // User ID
  actorType: string;  // 'STORE', 'PLATFORM', 'SUPPLIER'
  actorId: string;    // Store ID, etc.
  permissions?: string[];
  iat: number;
  exp: number;
  iss: string;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * GO-LIVE-046: Validate gateway headers for retailer-admin routes
 *
 * This middleware ensures that:
 * 1. Requests have a valid Authorization header with JWT
 * 2. The JWT is properly signed and not expired
 * 3. The gateway-provided headers (x-user-id, x-actor-id) match the JWT claims
 *
 * This provides defense-in-depth even if someone bypasses the API gateway.
 */
export function validateGatewayHeaders(req: Request, res: Response, next: NextFunction): void {
  // Skip for public paths (auth endpoints)
  if (req.path.startsWith('/auth/')) {
    return next();
  }

  // Get Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // AUDIT-API-019: Never trust x-user-id/x-actor-id headers without JWT.
    // If backend is accessed directly (bypassing gateway), these headers
    // can be spoofed. Always require Bearer token for defense-in-depth.
    log.info('[ValidateGateway] No authorization provided (gateway headers alone are not trusted)');
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  // Extract and validate JWT
  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
    }) as JwtPayload;

    // Validate required claims
    if (!decoded.sub || !decoded.actorId || !decoded.actorType) {
      log.info('[ValidateGateway] JWT missing required claims');
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token missing required claims.',
        },
      });
      return;
    }

    // Validate gateway headers match JWT claims (if headers present)
    const gatewayUserId = req.headers['x-user-id'] as string | undefined;
    const gatewayActorId = req.headers['x-actor-id'] as string | undefined;

    if (gatewayUserId && gatewayUserId !== decoded.sub) {
      log.warn(`[ValidateGateway] Mismatched x-user-id - header: ${gatewayUserId}, jwt: ${decoded.sub}`);
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Header mismatch detected.',
        },
      });
      return;
    }

    if (gatewayActorId && gatewayActorId !== decoded.actorId) {
      log.warn(`[ValidateGateway] Mismatched x-actor-id - header: ${gatewayActorId}, jwt: ${decoded.actorId}`);
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Header mismatch detected.',
        },
      });
      return;
    }

    // Set gateway headers from JWT if not present
    // This handles direct backend requests (bypassing gateway)
    if (!gatewayUserId) {
      req.headers['x-user-id'] = decoded.sub;
    }
    if (!gatewayActorId) {
      req.headers['x-actor-id'] = decoded.actorId;
    }
    if (!req.headers['x-actor-type']) {
      req.headers['x-actor-type'] = decoded.actorType;
    }

    log.info(`[ValidateGateway] JWT validated - userId: ${decoded.sub}, actorId: ${decoded.actorId}`);
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      log.info('[ValidateGateway] Token expired');
      res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired. Please login again.',
        },
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      log.info(`[ValidateGateway] Invalid token: ${error.message}`);
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token. Please login again.',
        },
      });
      return;
    }

    log.error('[ValidateGateway] Token verification error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication error.',
      },
    });
  }
}

/**
 * Extract store ID from validated gateway headers
 */
export function getValidatedStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  const actorType = req.headers['x-actor-type'];

  if (!actorId || actorType !== 'STORE') {
    return null;
  }

  return typeof actorId === 'string' ? actorId : null;
}

/**
 * Extract user ID from validated gateway headers
 */
export function getValidatedUserId(req: Request): string | null {
  const userId = req.headers['x-user-id'];
  return typeof userId === 'string' ? userId : null;
}
