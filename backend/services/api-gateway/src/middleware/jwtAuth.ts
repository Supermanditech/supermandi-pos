// JWT Authentication Middleware for API Gateway
// Verifies JWT tokens and sets x-user-id, x-actor-id headers for downstream services
// GO-LIVE-139: Reject demo tokens in production

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

// STAGING-FIX-005: Align fallback chain with backend's adminAuth.ts to prevent secret mismatches
const JWT_SECRET = process.env['JWT_SECRET'] || process.env['ADMIN_TOKEN'] || 'dev-jwt-secret';
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
  '/api/v1/orders',
  '/api/v1/catalog',
  '/api/v1/reorder',
  '/api/v1/voice',
  '/api/v1/platform',
  '/api/v1/suppliers',
  '/api/v1/documents',
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
export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if this is a public path (auth, registration, health endpoints)
  const isPublicPath = PUBLIC_PATHS.some(path => req.path.startsWith(path));
  if (isPublicPath) {
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

  console.log(`[JWT-DEBUG] ${req.method} ${req.path} - Token source: ${authHeader ? 'header' : token ? 'cookie' : 'MISSING'}`);

  if (!token) {
    console.log(`[JWT-DEBUG] Rejecting: No valid Bearer token or auth cookie`);
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
    console.log(`[JWT-DEBUG] Verifying token (len=${token.length}), issuer: ${JWT_ISSUER}`);

    // Verify and decode the token
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
    }) as JwtPayload;

    // Store decoded payload on request for logging/debugging
    req.jwtPayload = decoded;

    // GO-LIVE-139: Reject demo tokens in production
    if (decoded.demo === true && isProduction()) {
      console.warn(`[GO-LIVE-139] Rejected demo token in production: user=${decoded.sub}, actor=${decoded.actorId}`);
      res.status(403).json({
        error: {
          code: 'DEMO_TOKEN_REJECTED',
          message: 'Demo tokens are not allowed in production environment.',
        },
        requestId: req.correlationId,
      });
      return;
    }

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
