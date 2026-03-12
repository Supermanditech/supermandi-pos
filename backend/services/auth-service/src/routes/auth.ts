// Auth Routes - V3.0.9 compliant
// Public authentication endpoints (login, refresh, me)

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ApiError } from '@supermandi/common';
import { createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'auth-service', level: process.env.LOG_LEVEL || 'info' });
import {
  verifyUserCredentials,
  getUserWithRoles,
  getUser,
} from '../services/userService';
import {
  generateTokenPair,
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
  verifyRefreshToken,
} from '../services/jwtService';
import {
  createRefreshToken,
  revokeRefreshToken,
  findRefreshTokenByHash,
  revokeAllUserRefreshTokens,
  isRefreshTokenActive,
  listUserActiveSessions,
  revokeSessionById,
  enforceSessionLimit,
} from '../db/tokenQueries';
import { authenticate, getAuthUser } from '../middleware';
import { config } from '../config';
import { setAuthCookies, clearAuthCookies, getRefreshTokenFromRequest } from '../utils/cookies';
import { getRedis, blacklistAccessToken } from '../redis';

const router: Router = Router();

// SEC-001: Detect POS/mobile clients that need tokens in response body
// Web clients use HttpOnly cookies; POS uses Authorization header from body tokens
function isPosClient(req: Request): boolean {
  const ua = (req.get('user-agent') || '').toLowerCase();
  // React Native, Expo, or explicit POS client indicator
  return ua.includes('react-native') || ua.includes('expo') || ua.includes('okhttp') || req.headers['x-device-token'] !== undefined;
}

// =============================================================================
// SEC-002: Extract raw access token from request (header or cookie)
// Used for blacklisting on logout so the gateway rejects it immediately.
// =============================================================================

function extractAccessToken(req: Request): string | undefined {
  // POS/mobile: Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Web: HttpOnly cookie
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)sm_access_token=([^;]*)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return undefined;
}

// =============================================================================
// SEC-006: REDIS-BACKED RATE LIMITING (with in-memory fallback)
// =============================================================================

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 10; // per IP per window
const RATE_LIMIT_PREFIX = 'auth:login_rl:';

// In-memory fallback when Redis unavailable
const loginAttemptsFallback = new Map<string, { count: number; windowStart: number }>();

async function checkLoginRateLimit(ip: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const key = RATE_LIMIT_PREFIX + ip;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
      }
      if (count > MAX_LOGIN_ATTEMPTS) {
        throw ApiError.rateLimited('login');
      }
      return;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Redis error — fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const entry = loginAttemptsFallback.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttemptsFallback.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count++;
  if (entry.count > MAX_LOGIN_ATTEMPTS) {
    throw ApiError.rateLimited('login');
  }
}

// Cleanup stale fallback entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, entry] of loginAttemptsFallback) {
    if (entry.windowStart < cutoff) loginAttemptsFallback.delete(key);
  }
}, 5 * 60 * 1000);

// =============================================================================
// ERROR HANDLER WRAPPER
// =============================================================================

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): AsyncHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// SEC-008: RUNTIME INPUT VALIDATION
// =============================================================================

function validateLoginInput(body: unknown): { identifier: string; password: string } {
  if (!body || typeof body !== 'object') {
    throw ApiError.badRequest('Request body is required');
  }
  const { identifier, password } = body as Record<string, unknown>;
  if (typeof identifier !== 'string' || !identifier.trim()) {
    throw ApiError.badRequest('Email/phone (identifier) is required and must be a string');
  }
  if (typeof password !== 'string' || !password) {
    throw ApiError.badRequest('Password is required and must be a string');
  }
  // Sanitize: trim and limit length to prevent oversized payloads
  return {
    identifier: identifier.trim().substring(0, 255),
    password: password.substring(0, 128),
  };
}

function validateRefreshInput(body: unknown): { refreshToken?: string } {
  if (!body || typeof body !== 'object') return {};
  const { refreshToken } = body as Record<string, unknown>;
  if (refreshToken !== undefined && typeof refreshToken !== 'string') {
    throw ApiError.badRequest('refreshToken must be a string');
  }
  return { refreshToken: typeof refreshToken === 'string' ? refreshToken : undefined };
}

// =============================================================================
// LOGIN ENDPOINT
// =============================================================================

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email?: string;
    phone?: string;
    name: string;
    actorType: string;
    actorId?: string;
    roles: Array<{ name: string; permissions: string[] }>;
    permissions: string[];
  };
}

/**
 * POST /auth/login
 * Authenticate user and return JWT tokens
 */
router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    // SEC-008: Runtime input validation (replaces unsafe cast)
    const { identifier, password } = validateLoginInput(req.body);

    // SEC-006: Rate limit login attempts by IP (Redis-backed)
    await checkLoginRateLimit(req.ip || req.socket.remoteAddress || 'unknown');

    // AUTH-OTP-003: Verify credentials with lockout tracking
    const user = await verifyUserCredentials(identifier, password, req.ip || req.socket.remoteAddress);
    if (!user) {
      // SEC-012: Log failed login for security monitoring
      logger.warn(JSON.stringify({
        event: 'login_failed',
        identifier: identifier.includes('@') ? identifier.replace(/(.{2}).*(@.*)/, '$1***$2') : '****' + identifier.slice(-4),
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.get('user-agent')?.substring(0, 100),
        timestamp: new Date().toISOString(),
      }));
      throw ApiError.unauthorized('Invalid credentials');
    }

    // Get user with roles and permissions
    const userWithRoles = await getUserWithRoles(user.id);

    // Generate token pair
    const tokenPair = generateTokenPair(
      user.id,
      user.actorType,
      user.actorId,
      userWithRoles.permissions
    );

    // Store refresh token hash in database
    const refreshTokenHash = hashRefreshToken(tokenPair.refreshToken);
    await createRefreshToken({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: getRefreshTokenExpiry(),
      userAgent: req.get('user-agent'),
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    // AUTH-CONCURRENT-001: Enforce session limit (revoke oldest if over limit)
    if (config.maxConcurrentSessions > 0) {
      await enforceSessionLimit(user.id, config.maxConcurrentSessions);
    }

    // AUTH-STORAGE-001: Set HttpOnly cookies (web clients use cookies, POS uses body)
    const refreshTokenExpirySeconds = config.jwt.refreshTokenExpiresInDays * 86400;
    setAuthCookies(res, tokenPair.accessToken, tokenPair.refreshToken, tokenPair.expiresIn, refreshTokenExpirySeconds);

    // SEC-001: Only include tokens in body for POS/mobile clients
    // Web clients use HttpOnly cookies (XSS-safe)
    const includeTokensInBody = isPosClient(req);

    const response: LoginResponse = {
      accessToken: includeTokensInBody ? tokenPair.accessToken : '',
      refreshToken: includeTokensInBody ? tokenPair.refreshToken : '',
      expiresIn: tokenPair.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        actorType: user.actorType,
        actorId: user.actorId,
        roles: userWithRoles.roles,
        permissions: userWithRoles.permissions,
      },
    };

    res.json({ data: response });
  })
);

// =============================================================================
// REFRESH TOKEN ENDPOINT
// =============================================================================

interface RefreshResponse {
  accessToken: string;
  refreshToken: string; // AUTH-REFRESH-001: New refresh token (rotation)
  expiresIn: number;
}

/**
 * POST /auth/refresh
 * Exchange refresh token for new access token + new refresh token (rotation)
 * AUTH-REFRESH-001: Implements token rotation - old refresh token is revoked
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    // SEC-008: Validate body input before extracting refresh token
    const validatedBody = validateRefreshInput(req.body);
    // AUTH-STORAGE-001: Read refresh token from body (POS) or cookie (web)
    // Use validated body refreshToken if present, otherwise fall back to cookie
    const refreshToken = validatedBody.refreshToken || getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      throw ApiError.badRequest('Refresh token is required');
    }

    // Verify the refresh token JWT
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    // Check if refresh token exists and is not revoked
    const tokenHash = hashRefreshToken(refreshToken);
    const storedToken = await findRefreshTokenByHash(tokenHash);
    if (!storedToken) {
      throw ApiError.unauthorized('Refresh token has been revoked');
    }

    // Verify the token belongs to the user in the payload
    if (storedToken.userId !== payload.sub) {
      throw ApiError.unauthorized('Token mismatch');
    }

    // AUTH-IDLE-001: Server-side idle timeout enforcement
    const isActive = await isRefreshTokenActive(tokenHash, config.idleTimeoutMinutes);
    if (!isActive) {
      // Revoke the idle token and reject
      await revokeRefreshToken(tokenHash);
      throw ApiError.unauthorized('Session expired due to inactivity. Please log in again.');
    }

    // Get fresh user data with current permissions
    const userWithRoles = await getUserWithRoles(payload.sub);
    const user = await getUser(payload.sub);

    // Generate new access token with current permissions
    const accessToken = generateAccessToken({
      sub: user.id,
      actorType: user.actorType,
      actorId: user.actorId,
      permissions: userWithRoles.permissions,
    });

    // AUTH-REFRESH-001: Rotate refresh token - revoke old, issue new
    await revokeRefreshToken(tokenHash);
    // PRA-079: Carry actorType into rotated refresh token
    const { token: newRefreshToken } = generateRefreshToken(user.id, user.actorType);
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
    await createRefreshToken({
      userId: user.id,
      tokenHash: newRefreshTokenHash,
      expiresAt: getRefreshTokenExpiry(),
      userAgent: req.get('user-agent'),
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    // Calculate expiresIn (same as in jwtService)
    const expiresIn = 900; // 15 minutes default

    // AUTH-STORAGE-001: Set new HttpOnly cookies with rotated tokens
    const refreshTokenExpirySeconds = config.jwt.refreshTokenExpiresInDays * 86400;
    setAuthCookies(res, accessToken, newRefreshToken, expiresIn, refreshTokenExpirySeconds);

    const includeTokensInBody = isPosClient(req);

    const response: RefreshResponse = {
      accessToken: includeTokensInBody ? accessToken : '',
      refreshToken: includeTokensInBody ? newRefreshToken : '',
      expiresIn,
    };

    res.json({ data: response });
  })
);

// =============================================================================
// ME ENDPOINT
// =============================================================================

interface MeResponse {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  actorType: string;
  actorId?: string;
  status: string;
  roles: Array<{ name: string; permissions: string[] }>;
  permissions: string[];
}

/**
 * GET /auth/me
 * Get current authenticated user's profile and permissions
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // Get full user details
    const user = await getUser(authUser.id);
    const userWithRoles = await getUserWithRoles(authUser.id);

    const response: MeResponse = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      actorType: user.actorType,
      actorId: user.actorId,
      status: user.status,
      roles: userWithRoles.roles,
      permissions: userWithRoles.permissions,
    };

    res.json({ data: response });
  })
);

// =============================================================================
// LOGOUT ENDPOINT
// =============================================================================

/**
 * POST /auth/logout
 * Revoke the provided refresh token
 * SEC-002: Also blacklists the caller's access token via Redis for immediate revocation
 */
router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    // AUTH-STORAGE-001: Read refresh token from body (POS) or cookie (web)
    const refreshToken = getRefreshTokenFromRequest(req);

    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await revokeRefreshToken(tokenHash);
    }

    // SEC-002: Blacklist the caller's access token so the gateway rejects it immediately.
    // Extract from Authorization header (POS) or cookie (web).
    const rawAccessToken = extractAccessToken(req);
    if (rawAccessToken) {
      const atHash = crypto.createHash('sha256').update(rawAccessToken).digest('hex');
      await blacklistAccessToken(atHash, 900); // 900s = max 15-min token lifetime
    }

    // AUTH-STORAGE-001: Clear HttpOnly cookies
    clearAuthCookies(res);

    res.json({ message: 'Logged out successfully' });
  })
);

/**
 * POST /auth/logout-all
 * Revoke all refresh tokens for the authenticated user
 * SEC-002: Also blacklists the caller's current access token via Redis so the
 * api-gateway rejects it immediately (T-184) instead of waiting for the 15-min expiry.
 */
router.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const revokedCount = await revokeAllUserRefreshTokens(authUser.id);

    // SEC-002: Blacklist the caller's current access token in Redis.
    // The gateway uses sha256(token) as the blacklist key (T-184 jwtAuth.ts line 216).
    // By blacklisting this token, the gateway will reject it immediately on subsequent requests
    // instead of waiting for the 15-minute natural expiry.
    // Note: Other sessions' access tokens are NOT blacklisted here — they expire naturally
    // within 15 minutes, which is acceptable since their refresh tokens are already revoked.
    const rawAccessToken = extractAccessToken(req);
    if (rawAccessToken) {
      const tokenHash = crypto.createHash('sha256').update(rawAccessToken).digest('hex');
      // 900s = max access token lifetime (15 min)
      await blacklistAccessToken(tokenHash, 900);
    }

    // AUTH-STORAGE-001: Clear HttpOnly cookies for current browser session
    clearAuthCookies(res);

    res.json({
      message: 'All sessions logged out',
      revokedSessions: revokedCount,
    });
  })
);

// =============================================================================
// AUTH-CONCURRENT-001: SESSION MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * GET /auth/sessions
 * List active sessions for the authenticated user
 */
router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const sessions = await listUserActiveSessions(authUser.id);

    res.json({
      data: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
      })),
    });
  })
);

/**
 * DELETE /auth/sessions/:sessionId
 * Revoke a specific session
 */
router.delete(
  '/sessions/:sessionId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { sessionId } = req.params;

    if (!sessionId) {
      throw ApiError.badRequest('Session ID is required');
    }

    const revoked = await revokeSessionById(sessionId, authUser.id);
    if (!revoked) {
      throw ApiError.notFound('Session not found or already revoked');
    }

    res.json({ message: 'Session revoked successfully' });
  })
);

export default router;
