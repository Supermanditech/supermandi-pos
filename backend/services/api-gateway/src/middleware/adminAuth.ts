// SEC-ADMIN-001: Admin Authentication Middleware for API Gateway
// Protects /api/v1/admin/* routes with x-admin-token header check
// GO-LIVE-002: Added session-based JWT tokens with expiry
// GO-LIVE-003: Added rate limiting for admin token attempts

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@supermandi/common';
import {
  verifyAdminSession,
  verifyMasterToken,
  isMasterTokenConfigured,
} from '../services/adminSessionService';

const logger = createLogger({ service: 'api-gateway', level: process.env.LOG_LEVEL || 'info' });

// =============================================================================
// CONFIGURATION
// =============================================================================

// Routes that don't require admin authentication (public within admin namespace)
const ADMIN_PUBLIC_PATHS = [
  '/api/v1/admin/auth/login',
  '/api/v1/admin/auth/status',
  '/api/v1/admin/auth/send-email-otp',   // GO-LIVE-LOGIN-004: Email OTP request
  '/api/v1/admin/auth/verify-email-otp', // GO-LIVE-LOGIN-004: Email OTP verification
  '/api/v1/admin/health',
];

// GO-LIVE-003: Track failed admin auth attempts for rate limiting
const failedAttempts = new Map<string, { count: number; firstAttempt: number }>();
const FAILED_ATTEMPT_WINDOW_MS = 60000; // 1 minute
const MAX_FAILED_ATTEMPTS = 5;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * GO-LIVE-003: Check if IP is rate limited due to failed attempts
 */
function isRateLimited(ip: string): boolean {
  const record = failedAttempts.get(ip);
  if (!record) return false;

  // Clean up old records
  if (Date.now() - record.firstAttempt > FAILED_ATTEMPT_WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }

  return record.count >= MAX_FAILED_ATTEMPTS;
}

/**
 * GO-LIVE-003: Record a failed admin auth attempt
 */
function recordFailedAttempt(ip: string): void {
  const record = failedAttempts.get(ip);
  const now = Date.now();

  if (!record || now - record.firstAttempt > FAILED_ATTEMPT_WINDOW_MS) {
    // Start new window
    failedAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    // Increment existing
    record.count++;
  }
}

/**
 * GO-LIVE-003: Clear failed attempts on successful auth (optional - keep strict)
 */
function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Admin Authentication Middleware
 *
 * Protects /api/v1/admin/* routes with authentication.
 * GO-LIVE-002: Supports two authentication methods:
 *   1. Session JWT (preferred): Authorization: Bearer <session-token>
 *   2. Legacy x-admin-token header (deprecated, for backwards compatibility)
 *
 * GO-LIVE-003: Rate limits failed authentication attempts (5/minute)
 *
 * Proof requirements:
 * - curl without token → 401
 * - curl with invalid token → 403
 * - curl with valid session JWT → passes through
 * - curl with valid x-admin-token → passes through (deprecated)
 * - 6+ failed attempts in 1 minute → 429
 */
export async function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Only apply to admin routes
  if (!req.path.startsWith('/api/v1/admin')) {
    return next();
  }

  // LIVE.GW.ADMIN_PUBLIC_PATH_EXACT_MATCH.001: Exact match only — no prefix bypass
  if (ADMIN_PUBLIC_PATHS.some(path => req.path === path)) {
    return next();
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  // GO-LIVE-003: Check rate limiting first
  if (isRateLimited(clientIp)) {
    logger.info(`[ADMIN-AUTH] ${req.method} ${req.path} - Rate limited (IP: ${clientIp})`);
    res.status(429).json({
      error: {
        code: 'ADMIN_RATE_LIMIT_EXCEEDED',
        message: 'Too many failed admin authentication attempts. Please try again later.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // Check if admin auth is configured
  if (!isMasterTokenConfigured()) {
    logger.error('[ADMIN-AUTH] ADMIN_TOKEN env var not set - admin APIs disabled');
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Admin APIs are not configured',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // GO-LIVE-002: Try session JWT first (Authorization: Bearer <token>)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const sessionToken = authHeader.substring(7);
    const session = await verifyAdminSession(sessionToken);

    if (session) {
      // Stamp trusted admin context headers for downstream services.
      // Client-supplied values are already stripped by stripClientAuthHeaders.
      req.headers['x-user-id'] = session.sessionId;
      req.headers['x-actor-id'] = session.sessionId;
      req.headers['x-actor-type'] = 'platform';
      req.headers['x-permissions'] = '[]';
      clearFailedAttempts(clientIp);
      logger.info(`[ADMIN-AUTH] ${req.method} ${req.path} - Authenticated via session JWT`);
      return next();
    }

    // Invalid session JWT
    recordFailedAttempt(clientIp);
    logger.warn(`[ADMIN-AUTH] ${req.method} ${req.path} - Invalid session JWT (IP: ${clientIp})`);
    res.status(401).json({
      error: {
        code: 'INVALID_SESSION',
        message: 'Session expired or invalid. Please login again.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // Legacy: Try x-admin-token header (deprecated but still supported)
  const legacyToken = req.headers['x-admin-token'];
  const legacyTokenStr = Array.isArray(legacyToken) ? legacyToken[0] : legacyToken;

  if (legacyTokenStr) {
    // Verify using timing-safe comparison
    if (verifyMasterToken(legacyTokenStr)) {
      // Legacy token flow has no user identity; use deterministic service principal.
      req.headers['x-user-id'] = 'legacy-admin';
      req.headers['x-actor-id'] = 'legacy-admin';
      req.headers['x-actor-type'] = 'platform';
      req.headers['x-permissions'] = '[]';
      clearFailedAttempts(clientIp);
      logger.warn(`[ADMIN-AUTH] ${req.method} ${req.path} - Authenticated via legacy x-admin-token (DEPRECATED)`);
      return next();
    }

    // Invalid legacy token
    recordFailedAttempt(clientIp);
    logger.warn(`[ADMIN-AUTH] ${req.method} ${req.path} - Invalid x-admin-token (IP: ${clientIp})`);
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid admin token. Access denied.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // No authentication provided
  // RET-AUD-019: Do NOT count missing auth as failed attempt (only count actual invalid tokens)
  // This allows legitimate API discovery/testing while still blocking brute force attacks
  logger.info(`[ADMIN-AUTH] ${req.method} ${req.path} - No authentication provided (IP: ${clientIp})`);
  res.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Admin authentication required. Use Authorization: Bearer <session-token> header.',
    },
    requestId: req.correlationId,
  });
}
