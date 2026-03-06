// JWT Authentication Middleware for API Gateway
// Verifies JWT tokens and sets x-user-id, x-actor-id headers for downstream services
// GO-LIVE-139: Reject demo tokens in production
// T-184: Redis-based token blacklist for immediate revocation

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createLogger } from '@supermandi/common';
import { isTokenBlacklisted } from '../redis';

const logger = createLogger({ service: 'api-gateway', level: process.env.LOG_LEVEL || 'info' });

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
  demo?: boolean;     // GO-LIVE-139: Demo mode flag
  jti?: string;       // GO-LIVE-137: JWT ID for revocation
}

// =============================================================================
// GO-LIVE-139: Environment detection
// =============================================================================

function isProduction(): boolean {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  return env === 'production' || env === 'prod';
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

// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment
const JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    logger.error('[FATAL] JWT_SECRET environment variable is not set — service startup aborted');
    process.exit(1);
  }
  return secret;
})();
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';

// =============================================================================
// AUTH-GATEWAY-001: Route prefixes that REQUIRE JWT authentication at gateway.
// Routes NOT listed here pass through without gateway JWT check (POS, admin, etc.).
// POS uses device tokens (validated by backend). Admin uses adminAuth middleware.
// =============================================================================
const JWT_REQUIRED_PREFIXES = [
  '/api/v1/retailer-admin',
  '/api/v1/supplier',
  '/api/v1/inventory',
  // ISSUE-015: catalog/orders/reorder removed — POS uses device tokens, not JWT.
  // Backend route handlers enforce requireDeviceToken or requireAuth as needed.
  '/api/v1/voice',
  '/api/v1/platform',
  '/api/v1/suppliers',
  '/api/v1/documents',
  '/api/v1/chat',     // PRA-082: Chat routes need JWT for x-user-id/x-actor-id headers
  '/api/v1/credit',   // PRA-082: Credit provider routes need JWT for store context
];

// Public paths within JWT-required prefixes (no auth needed)
// GO-LIVE-RET-AUTH-001: firebase-otp-login (OTP-first flow)
// GO-LIVE-LOGIN: register, login, forgot-password
// REG-AUTH-201: Registration routes (public, no auth required)
// AUTH-GATEWAY-001: Added supplier auth + registration paths
const PUBLIC_PATHS = [
  // Retailer auth (public)
  '/api/v1/retailer-admin/auth/firebase-login',
  '/api/v1/retailer-admin/auth/firebase-otp-login',
  '/api/v1/retailer-admin/auth/register',
  '/api/v1/retailer-admin/auth/login',
  '/api/v1/retailer-admin/auth/forgot-password',
  '/api/v1/retailer-admin/auth/refresh',
  '/api/v1/retailer-admin/auth/select-store', // STG-053: Self-verifies JWT (accepts tokens without actorId)
  '/api/v1/retailer-admin/health',
  '/api/v1/retailer-admin/registration',
  // Supplier auth (public)
  '/api/v1/supplier/auth/register',
  '/api/v1/supplier/auth/login',
  '/api/v1/supplier/auth/forgot-password',
  '/api/v1/supplier/auth/reset-password',
  '/api/v1/supplier/auth/firebase-register',
  '/api/v1/supplier/auth/firebase-login',
  '/api/v1/supplier/auth/refresh',
  '/api/v1/supplier/registration/',
  // Document upload (public for registration - application entity validated server-side)
  '/api/v1/documents/upload',
  // Health
  '/health',
  '/healthz',
];

// LIVE.API.PLATFORM_STORES_PUBLIC_ACCESS_PARITY.001: GET-only public paths
// These paths are public only for GET requests (reads). Writes still require JWT.
const PUBLIC_GET_PATHS = [
  '/api/v1/platform/stores',
];

// =============================================================================
// AUTH-STORAGE-001: COOKIE HELPER
// =============================================================================

/**
 * Extract a cookie value from the Cookie header without cookie-parser dependency.
 */
function getCookieValue(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : undefined;
}

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
export async function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Check if this is a public path (auth, registration, health endpoints)
  const isPublicPath = PUBLIC_PATHS.some(path => req.path.startsWith(path));
  // LIVE.API.HEALTH_ENDPOINT_PARITY.001: All /health and /healthz endpoints are public for monitoring
  const isHealthPath = req.path.endsWith('/health') || req.path.endsWith('/healthz');
  // LIVE.API.PLATFORM_STORES_PUBLIC_ACCESS_PARITY.001: GET-only public paths (reads public, writes require JWT)
  const isPublicGetPath = req.method === 'GET' && PUBLIC_GET_PATHS.some(path => req.path.startsWith(path));
  if (isPublicPath || isHealthPath || isPublicGetPath) {
    return next();
  }

  // AUTH-GATEWAY-001: Only apply JWT validation to routes in JWT_REQUIRED_PREFIXES.
  // Routes not listed (POS, admin, auth, demo, webhooks) pass through.
  // Admin routes are handled by adminAuthMiddleware separately.
  const requiresJwt = JWT_REQUIRED_PREFIXES.some(prefix => req.path.startsWith(prefix));
  if (!requiresJwt) {
    return next();
  }

  // Get token from Authorization header or HttpOnly cookie (AUTH-STORAGE-001)
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // AUTH-STORAGE-001: Fall back to HttpOnly cookie for web clients
    token = getCookieValue(req, 'sm_access_token');
  }

  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header. Use Bearer <token>.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  try {
    // Verify and decode the token
    // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      algorithms: ['HS256'],
      clockTolerance: 30, // ISSUE-187: 30s tolerance for Cloud Run NTP drift
    }) as JwtPayload;

    // Store decoded payload on request for logging/debugging
    req.jwtPayload = decoded;

    // GO-LIVE-139: Reject demo tokens in production
    if (decoded.demo === true && isProduction()) {
      logger.warn(`[GO-LIVE-139] Rejected demo token in production: user=${decoded.sub}, actor=${decoded.actorId}`);
      res.status(403).json({
        error: {
          code: 'DEMO_TOKEN_REJECTED',
          message: 'Demo tokens are not allowed in production environment.',
        },
        requestId: req.correlationId,
      });
      return;
    }

    // T-184: Check Redis blacklist for immediate token revocation
    // Use jti if present, otherwise hash the token as the blacklist key
    const blacklistKey = decoded.jti || crypto.createHash('sha256').update(token).digest('hex');
    try {
      const revoked = await isTokenBlacklisted(blacklistKey);
      if (revoked) {
        logger.warn(`[T-184] Rejected blacklisted token: key=${blacklistKey.substring(0, 8)}..., user=${decoded.sub}`);
        res.status(401).json({
          error: {
            code: 'TOKEN_REVOKED',
            message: 'This session has been logged out. Please login again.',
          },
          requestId: req.correlationId,
        });
        return;
      }
    } catch (blacklistError) {
      // R7.BE.001: Fail closed when revocation store is unavailable.
      // This prevents revoked tokens from being accepted during Redis outages.
      logger.error('[T-184] Redis blacklist check failed (failing closed)', blacklistError instanceof Error ? blacklistError : undefined, { raw: blacklistError });
      res.status(503).json({
        error: {
          code: 'AUTH_VALIDATION_UNAVAILABLE',
          message: 'Session validation is temporarily unavailable. Please retry shortly.',
        },
        requestId: req.correlationId,
      });
      return;
    }

    // Validate required claims
    if (!decoded.sub || !decoded.actorId || !decoded.actorType) {
      // STG-427 FIX: Admin email OTP JWTs have {email, role, type} but not
      // {sub, actorId, actorType}. Allow admin JWTs to pass through to chat
      // and other JWT-required routes with appropriate gateway headers.
      const adminPayload = decoded as unknown as Record<string, unknown>;
      if (adminPayload.type === 'admin' && typeof adminPayload.email === 'string') {
        req.headers['x-user-id'] = adminPayload.email;
        req.headers['x-actor-id'] = adminPayload.email;
        req.headers['x-actor-type'] = 'admin';
        req.headers['x-permissions'] = JSON.stringify([]);
        return next();
      }

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

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
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
    logger.error('[AUTH ERROR]', error instanceof Error ? error : undefined, { raw: error });
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
  // LIVE.GW.STORE_ISOLATION.ADMIN_HEADER_STRIP.001: Strip admin token to prevent client spoofing
  delete req.headers['x-admin-token'];
  next();
}
