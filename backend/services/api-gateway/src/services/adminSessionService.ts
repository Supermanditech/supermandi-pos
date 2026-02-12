// GO-LIVE-002: Admin Session Service
// Manages admin JWT session tokens with expiry and rotation
// Replaces static admin token with time-bound sessions
// GO-LIVE-103: Reads ADMIN_TOKEN from Docker secret file (more secure than env var)

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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
const MAX_ACTIVE_SESSIONS = 10; // Per admin

// JWT configuration
// STAGING-FIX-005: Align fallback chain with backend's adminAuth.ts to prevent secret mismatches
// AUDIT-API-007: Fail-fast in production if secrets missing
const JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET'] || process.env['ADMIN_TOKEN'];
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL] JWT_SECRET must be set in production');
      process.exit(1);
    }
    return 'dev-jwt-secret';
  }
  return secret;
})();
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-admin';

// SECRET-CLEANUP-001: ADMIN_TOKEN from env var only (Cloud Run compatible)
// File-based secrets removed — Cloud Run uses Secret Manager → env vars
function loadAdminToken(): string | undefined {
  const envToken = process.env['ADMIN_TOKEN']?.trim();
  if (envToken) {
    console.log('[AdminSession] ADMIN_TOKEN loaded from environment variable');
    return envToken;
  }
  if (process.env['NODE_ENV'] === 'production') {
    console.error('[AdminSession] FATAL: ADMIN_TOKEN is required in production but not set');
    process.exit(1);
  }
  return undefined;
}

// Master admin token (for initial login only)
const ADMIN_TOKEN = loadAdminToken();

// =============================================================================
// SESSION STORAGE (In-memory, should use Redis for production scale)
// =============================================================================

// Map of sessionId -> AdminSession
const activeSessions = new Map<string, AdminSession>();

// Cleanup interval (run every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.expiresAt < now) {
      activeSessions.delete(sessionId);
      console.log(`[AdminSession] Expired session removed: ${sessionId.substring(0, 8)}...`);
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
    console.error('[AdminSession] ADMIN_TOKEN not configured');
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
 * Returns a JWT that expires after SESSION_EXPIRY_HOURS
 */
export function createAdminSession(ip: string, userAgent?: string): { token: string; expiresAt: number } {
  // Generate unique session ID
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_EXPIRY_MS;

  // Store session
  const session: AdminSession = {
    sessionId,
    createdAt: now,
    expiresAt,
    ip,
    userAgent,
  };
  activeSessions.set(sessionId, session);

  // Enforce max active sessions
  if (activeSessions.size > MAX_ACTIVE_SESSIONS) {
    // Remove oldest session
    let oldest: { id: string; time: number } | null = null;
    for (const [id, s] of activeSessions.entries()) {
      if (!oldest || s.createdAt < oldest.time) {
        oldest = { id, time: s.createdAt };
      }
    }
    if (oldest) {
      activeSessions.delete(oldest.id);
      console.log(`[AdminSession] Max sessions reached, removed oldest: ${oldest.id.substring(0, 8)}...`);
    }
  }

  // Generate JWT
  const payload: Omit<AdminSessionPayload, 'iat' | 'exp' | 'iss'> = {
    sub: sessionId,
    type: 'admin',
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: `${SESSION_EXPIRY_HOURS}h`,
    issuer: JWT_ISSUER,
  });

  console.log(`[AdminSession] Created session ${sessionId.substring(0, 8)}... for IP: ${ip}`);

  return { token, expiresAt };
}

/**
 * Verify an admin session JWT
 * Returns the session if valid, null otherwise
 * GO-LIVE-LOGIN-004: Also accepts JWTs from email OTP login (main-backend)
 */
export function verifyAdminSession(token: string): AdminSession | null {
  try {
    // First try with gateway's JWT_SECRET and issuer (legacy master token flow)
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: JWT_ISSUER,
      }) as AdminSessionPayload;

      // Check it's an admin token
      if (decoded.type !== 'admin') {
        console.log('[AdminSession] Token is not an admin session token');
        return null;
      }

      // Check session exists and hasn't been revoked
      const session = activeSessions.get(decoded.sub);
      if (!session) {
        console.log(`[AdminSession] Session not found or revoked: ${decoded.sub.substring(0, 8)}...`);
        // Don't return null yet - might be an email OTP token
      } else {
        // Check session hasn't expired (belt and suspenders - JWT also checks)
        if (session.expiresAt < Date.now()) {
          activeSessions.delete(decoded.sub);
          console.log(`[AdminSession] Session expired: ${decoded.sub.substring(0, 8)}...`);
          return null;
        }
        return session;
      }
    } catch {
      // Gateway JWT verification failed - try email OTP token below
    }

    // GO-LIVE-LOGIN-004: Try verifying as email OTP JWT from main-backend
    // Email OTP tokens have { email, role, type } payload and use the shared JWT_SECRET
    const emailOtpDecoded = jwt.verify(token, JWT_SECRET) as { email?: string; role?: string; type?: string; exp?: number };

    if (emailOtpDecoded.email && emailOtpDecoded.role === 'super_admin' && emailOtpDecoded.type === 'admin') {
      console.log(`[AdminSession] Verified email OTP token for: ${emailOtpDecoded.email}`);
      // Return a synthetic session for email OTP tokens
      return {
        sessionId: `email-otp-${emailOtpDecoded.email}`,
        createdAt: Date.now(),
        expiresAt: (emailOtpDecoded.exp || 0) * 1000, // JWT exp is in seconds
        ip: 'email-otp',
        userAgent: 'email-otp-login',
      };
    }

    console.log('[AdminSession] Token is not a valid admin or email OTP token');
    return null;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('[AdminSession] Session token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.log(`[AdminSession] Invalid token: ${error.message}`);
    } else {
      console.error('[AdminSession] Token verification error:', error);
    }
    return null;
  }
}

/**
 * Revoke an admin session (logout)
 */
export function revokeAdminSession(token: string): boolean {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      ignoreExpiration: true, // Allow revoking expired tokens
    }) as AdminSessionPayload;

    if (activeSessions.has(decoded.sub)) {
      activeSessions.delete(decoded.sub);
      console.log(`[AdminSession] Session revoked: ${decoded.sub.substring(0, 8)}...`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Refresh an admin session
 * Creates a new session and revokes the old one
 * STAGING-FIX-005: Don't convert email OTP tokens to gateway session tokens.
 * Email OTP tokens are self-contained (verified cryptographically) and survive
 * gateway restarts. Gateway session tokens depend on in-memory state and are
 * lost on cold start, causing recurring 401 errors.
 */
export function refreshAdminSession(token: string, ip: string, userAgent?: string): { token: string; expiresAt: number } | null {
  const currentSession = verifyAdminSession(token);
  if (!currentSession) {
    return null;
  }

  // STAGING-FIX-005: Email OTP tokens are self-contained and survive gateway restarts.
  // Don't "upgrade" them to gateway session tokens (which are lost on cold start).
  if (currentSession.sessionId.startsWith('email-otp-')) {
    return { token, expiresAt: currentSession.expiresAt };
  }

  // Revoke old session
  revokeAdminSession(token);

  // Create new session
  return createAdminSession(ip, userAgent);
}

/**
 * Get active session count (for monitoring)
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
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
