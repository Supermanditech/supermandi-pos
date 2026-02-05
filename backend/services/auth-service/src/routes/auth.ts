// Auth Routes - V3.0.9 compliant
// Public authentication endpoints (login, refresh, me)

import { Router, Request, Response, NextFunction } from 'express';
import { ApiError } from '@supermandi/common';
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

const router: Router = Router();

// =============================================================================
// AUTH-OTP-002: IN-MEMORY RATE LIMITING
// =============================================================================

const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 10; // per IP per window

function checkLoginRateLimit(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return;
  }

  entry.count++;
  if (entry.count > MAX_LOGIN_ATTEMPTS) {
    throw ApiError.rateLimited('login');
  }
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, entry] of loginAttempts) {
    if (entry.windowStart < cutoff) loginAttempts.delete(key);
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
// LOGIN ENDPOINT
// =============================================================================

interface LoginRequest {
  identifier: string; // email or phone
  password: string;
}

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
    const { identifier, password } = req.body as LoginRequest;

    // AUTH-OTP-002: Rate limit login attempts by IP
    checkLoginRateLimit(req.ip || req.socket.remoteAddress || 'unknown');

    // Validate input
    if (!identifier || !password) {
      throw ApiError.badRequest('Email/phone and password are required');
    }

    // AUTH-OTP-003: Verify credentials with lockout tracking
    const user = await verifyUserCredentials(identifier, password, req.ip || req.socket.remoteAddress);
    if (!user) {
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

    // Build response (tokens still in body for POS app backward compatibility)
    const response: LoginResponse = {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
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
    // AUTH-STORAGE-001: Read refresh token from body (POS) or cookie (web)
    const refreshToken = getRefreshTokenFromRequest(req);

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
    const { token: newRefreshToken } = generateRefreshToken(user.id);
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

    const response: RefreshResponse = {
      accessToken,
      refreshToken: newRefreshToken,
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

    // AUTH-STORAGE-001: Clear HttpOnly cookies
    clearAuthCookies(res);

    res.json({ message: 'Logged out successfully' });
  })
);

/**
 * POST /auth/logout-all
 * Revoke all refresh tokens for the authenticated user
 */
router.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const revokedCount = await revokeAllUserRefreshTokens(authUser.id);

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
