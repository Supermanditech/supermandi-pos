// GO-LIVE-002: Admin Session Service
// Manages admin JWT session tokens with expiry and rotation
// Replaces static admin token with time-bound sessions
// GO-LIVE-103: Reads ADMIN_TOKEN from Docker secret file (more secure than env var)

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createLogger } from '@supermandi/common';
import { getGatewayRedis } from '../redis';

const logger = createLogger({ service: 'api-gateway', level: process.env.LOG_LEVEL || 'info' });

// =============================================================================
// TYPES
// =============================================================================

export interface AdminSessionPayload {
  sub: string;        // Session ID
  type: 'admin';      // Token type
  iat: number;        // Issued at
  exp: number;        // Expiry
  iss: string;        // Issuer
}

export interface AdminSession {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
  userAgent?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Session configuration
const SESSION_EXPIRY_HOURS = 8; // 8 hour sessions
const SESSION_EXPIRY_MS = SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
// T1-001: Max sessions enforced via Redis TTL (no longer needs in-memory limit)

// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment
const JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    logger.error('[FATAL] JWT_SECRET environment variable is not set — service startup aborted');
    process.exit(1);
  }
  return secret;
})();
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-admin';

// SECRET-CLEANUP-001: ADMIN_TOKEN from env var only (Cloud Run compatible)
// File-based secrets removed — Cloud Run uses Secret Manager → env vars
function loadAdminToken(): string | undefined {
  const envToken = process.env['ADMIN_TOKEN']?.trim();
  if (envToken) {
    logger.info('[AdminSession] ADMIN_TOKEN loaded from environment variable');
    return envToken;
  }
  if (process.env['NODE_ENV'] === 'production') {
    logger.error('[AdminSession] FATAL: ADMIN_TOKEN is required in production but not set');
    process.exit(1);
  }
  return undefined;
}

// Master admin token (for initial login only)
const ADMIN_TOKEN = loadAdminToken();

// =============================================================================
// T1-001: SESSION STORAGE — Redis primary, in-memory fallback
// Redis keys: supermandi:admin_session:{sessionId} with TTL = session expiry
// =============================================================================

const REDIS_SESSION_PREFIX = 'supermandi:admin_session:';
const SESSION_EXPIRY_SECONDS = SESSION_EXPIRY_HOURS * 60 * 60;

// In-memory fallback for when Redis is unavailable
const localSessions = new Map<string, AdminSession>();

async function storeSession(sessionId: string, session: AdminSession): Promise<void> {
  const redis = getGatewayRedis();
  if (redis) {
    try {
      await redis.setex(
        REDIS_SESSION_PREFIX + sessionId,
        SESSION_EXPIRY_SECONDS,
        JSON.stringify(session)
      );
      return;
    } catch (err) {
      logger.warn('[AdminSession] Redis store failed, using local fallback:', { err });
    }
  }
  localSessions.set(sessionId, session);
}

async function loadSession(sessionId: string): Promise<AdminSession | null> {
  const redis = getGatewayRedis();
  if (redis) {
    try {
      const data = await redis.get(REDIS_SESSION_PREFIX + sessionId);
      if (data) return JSON.parse(data) as AdminSession;
      return null;
    } catch (err) {
      logger.warn('[AdminSession] Redis load failed, checking local fallback:', { err });
    }
  }
  return localSessions.get(sessionId) ?? null;
}

async function removeSession(sessionId: string): Promise<void> {
  const redis = getGatewayRedis();
  if (redis) {
    try {
      await redis.del(REDIS_SESSION_PREFIX + sessionId);
    } catch (err) {
      logger.warn('[AdminSession] Redis delete failed:', { err });
    }
  }
  localSessions.delete(sessionId);
}

// Cleanup local fallback sessions (Redis handles TTL automatically)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of localSessions.entries()) {
    if (session.expiresAt < now) {
      localSessions.delete(sessionId);
      logger.info(`[AdminSession] Expired local session removed: ${sessionId.substring(0, 8)}...`);
    }
  }
}, 5 * 60 * 1000);

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Verify master admin token
 * Used only for initial login to exchange for session token
 */
export function verifyMasterToken(token: string): boolean {
  if (!ADMIN_TOKEN) {
    logger.error('[AdminSession] ADMIN_TOKEN not configured');
    return false;
  }
  // Timing-safe comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(token.trim());
  const adminBuffer = Buffer.from(ADMIN_TOKEN);
  if (tokenBuffer.length !== adminBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(tokenBuffer, adminBuffer);
}

/**
 * Create a new admin session
 * T1-001: Now async — stores session in Redis with TTL
 * Returns a JWT that expires after SESSION_EXPIRY_HOURS
 */
export async function createAdminSession(ip: string, userAgent?: string): Promise<{ token: string; expiresAt: number }> {
  // Generate unique session ID
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_EXPIRY_MS;

  // Store session in Redis (with TTL) or local fallback
  const session: AdminSession = {
    sessionId,
    createdAt: now,
    expiresAt,
    ip,
    userAgent,
  };
  await storeSession(sessionId, session);

  // Generate JWT
  const payload: Omit<AdminSessionPayload, 'iat' | 'exp' | 'iss'> = {
    sub: sessionId,
    type: 'admin',
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: `${SESSION_EXPIRY_HOURS}h`,
    issuer: JWT_ISSUER,
  });

  logger.info(`[AdminSession] Created session ${sessionId.substring(0, 8)}... for IP: ${ip}`);

  return { token, expiresAt };
}

/**
 * Verify an admin session JWT
 * T1-001: Now async — checks Redis for session existence
 * Returns the session if valid, null otherwise
 * GO-LIVE-LOGIN-004: Also accepts JWTs from email OTP login (main-backend)
 */
export async function verifyAdminSession(token: string): Promise<AdminSession | null> {
  try {
    // First try with gateway's JWT_SECRET and issuer (legacy master token flow)
    try {
      // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: JWT_ISSUER,
        algorithms: ['HS256'],
      }) as AdminSessionPayload;

      // Check it's an admin token
      if (decoded.type !== 'admin') {
        logger.info('[AdminSession] Token is not an admin session token');
        return null;
      }

      // T1-001: Check session exists in Redis (or local fallback)
      const session = await loadSession(decoded.sub);
      if (!session) {
        logger.info(`[AdminSession] Session not found or revoked: ${decoded.sub.substring(0, 8)}...`);
        // Don't return null yet - might be an email OTP token
      } else {
        // Check session hasn't expired (belt and suspenders - JWT also checks)
        if (session.expiresAt < Date.now()) {
          await removeSession(decoded.sub);
          logger.info(`[AdminSession] Session expired: ${decoded.sub.substring(0, 8)}...`);
          return null;
        }
        return session;
      }
    } catch {
      // Gateway JWT verification failed - try email OTP token below
    }

    // GO-LIVE-LOGIN-004: Try verifying as email OTP JWT from main-backend
    // Email OTP tokens have { email, role, type } payload and use the shared JWT_SECRET
    // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
    const emailOtpDecoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { email?: string; role?: string; type?: string; exp?: number };

    if (emailOtpDecoded.email && emailOtpDecoded.role === 'super_admin' && emailOtpDecoded.type === 'admin') {
      logger.info(`[AdminSession] Verified email OTP token for: ***@${emailOtpDecoded.email?.split('@')[1] || '***'}`);
      // Return a synthetic session for email OTP tokens
      return {
        sessionId: `email-otp-${emailOtpDecoded.email}`,
        createdAt: Date.now(),
        expiresAt: (emailOtpDecoded.exp || 0) * 1000, // JWT exp is in seconds
        ip: 'email-otp',
        userAgent: 'email-otp-login',
      };
    }

    logger.info('[AdminSession] Token is not a valid admin or email OTP token');
    return null;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.info('[AdminSession] Session token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.info(`[AdminSession] Invalid token: ${error.message}`);
    } else {
      logger.error('[AdminSession] Token verification error:', error instanceof Error ? error : undefined);
    }
    return null;
  }
}

/**
 * Revoke an admin session (logout)
 * T1-001: Now async — removes from Redis
 */
export async function revokeAdminSession(token: string): Promise<boolean> {
  try {
    // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      algorithms: ['HS256'],
      ignoreExpiration: true, // Allow revoking expired tokens
    }) as AdminSessionPayload;

    await removeSession(decoded.sub);
    logger.info(`[AdminSession] Session revoked: ${decoded.sub.substring(0, 8)}...`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Refresh an admin session
 * T1-001: Now async — creates new session in Redis and revokes old one
 * STAGING-FIX-005: Don't convert email OTP tokens to gateway session tokens.
 * Email OTP tokens are self-contained (verified cryptographically) and survive
 * gateway restarts. Gateway session tokens depend on in-memory state and are
 * lost on cold start, causing recurring 401 errors.
 */
export async function refreshAdminSession(token: string, ip: string, userAgent?: string): Promise<{ token: string; expiresAt: number } | null> {
  const currentSession = await verifyAdminSession(token);
  if (!currentSession) {
    return null;
  }

  // STAGING-FIX-005: Email OTP tokens are self-contained and survive gateway restarts.
  // Don't "upgrade" them to gateway session tokens (which are lost on cold start).
  if (currentSession.sessionId.startsWith('email-otp-')) {
    return { token, expiresAt: currentSession.expiresAt };
  }

  // Revoke old session
  await revokeAdminSession(token);

  // Create new session
  return createAdminSession(ip, userAgent);
}

/**
 * Get active session count (for monitoring)
 * T1-001: Returns local fallback count; Redis sessions expire via TTL
 */
export function getActiveSessionCount(): number {
  return localSessions.size;
}

/**
 * Check if master token is configured
 */
export function isMasterTokenConfigured(): boolean {
  return !!ADMIN_TOKEN;
}

/**
 * GO-LIVE-UI-001: Get master token for proxy forwarding
 * Used by proxy to add x-admin-token header for authenticated admin requests
 */
export function getMasterToken(): string | undefined {
  return ADMIN_TOKEN;
}
