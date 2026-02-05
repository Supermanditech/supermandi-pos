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
  hashRefreshToken,
  getRefreshTokenExpiry,
  verifyRefreshToken,
} from '../services/jwtService';
import {
  createRefreshToken,
  revokeRefreshToken,
  findRefreshTokenByHash,
  revokeAllUserRefreshTokens,
} from '../db/tokenQueries';
import { authenticate, getAuthUser } from '../middleware';

const router: Router = Router();

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

    // Validate input
    if (!identifier || !password) {
      throw ApiError.badRequest('Email/phone and password are required');
    }

    // Verify credentials
    const user = await verifyUserCredentials(identifier, password);
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

    // Build response
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

interface RefreshRequest {
  refreshToken: string;
}

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

/**
 * POST /auth/refresh
 * Exchange refresh token for new access token
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshRequest;

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

    // Calculate expiresIn (same as in jwtService)
    const expiresIn = 900; // 15 minutes default

    const response: RefreshResponse = {
      accessToken,
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
    const { refreshToken } = req.body as { refreshToken?: string };

    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await revokeRefreshToken(tokenHash);
    }

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

    res.json({
      message: 'All sessions logged out',
      revokedSessions: revokedCount,
    });
  })
);

export default router;
