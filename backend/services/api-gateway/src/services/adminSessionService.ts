// GO-LIVE-002: Admin Session Service
// Manages admin JWT session tokens with expiry and rotation
// Replaces static admin token with time-bound sessions
// GO-LIVE-103: Reads ADMIN_TOKEN from Docker secret file (more secure than env var)

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';

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
const JWT_SECRET = process.env['JWT_SECRET'] || 'dev-secret-change-in-prod';
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-admin';

// GO-LIVE-103: Read ADMIN_TOKEN from Docker secret file (preferred) or env var (fallback)
function loadAdminToken(): string | undefined {
  // Try reading from Docker secret file first (more secure - not exposed in docker inspect)
  const tokenFilePath = process.env['ADMIN_TOKEN_FILE'];
  if (tokenFilePath) {
    try {
      const token = fs.readFileSync(tokenFilePath, 'utf8').trim();
      if (token) {
        console.log('[AdminSession] ADMIN_TOKEN loaded from secret file');
        return token;
      }
    } catch (err) {
      // File doesn't exist or can't be read - fall through to env var
      console.warn('[AdminSession] Could not read ADMIN_TOKEN_FILE, falling back to env var');
    }
  }
  // Fallback to environment variable (for backwards compatibility)
  const envToken = process.env['ADMIN_TOKEN']?.trim();
  if (envToken) {
    console.log('[AdminSession] ADMIN_TOKEN loaded from environment variable');
  }
  return envToken;
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
 */
export function refreshAdminSession(token: string, ip: string, userAgent?: string): { token: string; expiresAt: number } | null {
  const currentSession = verifyAdminSession(token);
  if (!currentSession) {
    return null;
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
