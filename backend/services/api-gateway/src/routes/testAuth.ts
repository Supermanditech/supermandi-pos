/**
 * TEST AUTH ROUTES - For automated testing only
 *
 * SECURITY + STAGE-005: These routes are ONLY available in development.
 * Disabled in both production AND staging to prevent public test token minting.
 *
 * Provides:
 * - POST /api/test/mint-token - Mint a short-lived test token
 * - GET /api/test/verify-token - Verify a token and return payload
 *
 * Usage (development only):
 *   curl -X POST $GATEWAY_URL/api/test/mint-token \
 *     -H "Content-Type: application/json" \
 *     -d '{"ttl": 30, "userId": "test-user", "storeId": "test-store"}'
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'
const TEST_JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    const env = (process.env.NODE_ENV || '').toLowerCase();
    if (env === 'development' || env === 'test') {
      return 'dev-secret-change-in-prod';
    }
    console.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');
    process.exit(1);
  }
  return secret;
})();

// Test user data structure
interface TestTokenPayload {
  userId: string;
  storeId: string;
  phone?: string;
  role?: string;
}

interface MintTokenRequest {
  ttl?: number; // Time to live in seconds (default: 30)
  userId?: string;
  storeId?: string;
  phone?: string;
  role?: string;
}

export function createTestAuthRouter(): Router {
  const router = Router();

  // STAGE-005: Only enable in development (disabled in staging AND production)
  // PRA-079: Require explicit 'development' — never enable when NODE_ENV is unset
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    // Return router with no routes - all requests will 404
    console.log(`[TEST-AUTH] Test auth routes DISABLED in ${process.env.NODE_ENV}`);
    return router;
  }

  console.log('[TEST-AUTH] Test auth routes ENABLED (development environment)');

  /**
   * POST /api/test/mint-token
   *
   * Mint a test JWT token with short TTL for automated refresh testing.
   *
   * Request body:
   *   {
   *     "ttl": 30,           // Optional: seconds until expiry (default: 30, max: 300)
   *     "userId": "test-1",  // Optional: user ID (default: "test-user-001")
   *     "storeId": "store-1", // Optional: store ID (default: "test-store-001")
   *     "phone": "+919999999999", // Optional: phone number
   *     "role": "retailer"   // Optional: role (default: "retailer")
   *   }
   *
   * Response:
   *   {
   *     "success": true,
   *     "accessToken": "eyJ...",
   *     "refreshToken": "eyJ...",
   *     "expiresIn": 30,
   *     "expiresAt": "2026-02-03T12:00:30.000Z",
   *     "payload": { ... }
   *   }
   */
  router.post('/mint-token', (req: Request, res: Response) => {
    try {
      const body = req.body as MintTokenRequest;

      // Validate TTL (max 5 minutes for safety)
      const ttl = Math.min(body.ttl || 30, 300);
      if (ttl < 1) {
        res.status(400).json({
          error: { code: 'INVALID_TTL', message: 'TTL must be at least 1 second' },
        });
        return;
      }

      // Build payload
      const payload: TestTokenPayload = {
        userId: body.userId || `test-user-${Date.now()}`,
        storeId: body.storeId || `test-store-${Date.now()}`,
        phone: body.phone || '+919999999999',
        role: body.role || 'retailer',
      };

      // Generate access token
      const accessToken = jwt.sign(
        {
          sub: payload.userId,
          userId: payload.userId,
          storeId: payload.storeId,
          phone: payload.phone,
          role: payload.role,
          type: 'access',
          test: true, // Mark as test token
        },
        TEST_JWT_SECRET,
        { expiresIn: ttl }
      );

      // Generate refresh token (longer TTL)
      const refreshToken = jwt.sign(
        {
          sub: payload.userId,
          userId: payload.userId,
          storeId: payload.storeId,
          type: 'refresh',
          test: true,
        },
        TEST_JWT_SECRET,
        { expiresIn: ttl * 10 } // 10x access token TTL
      );

      const expiresAt = new Date(Date.now() + ttl * 1000);

      res.json({
        success: true,
        accessToken,
        refreshToken,
        expiresIn: ttl,
        expiresAt: expiresAt.toISOString(),
        payload,
        _testOnly: true,
        _warning: 'This endpoint is for testing only and is disabled in production',
      });
    } catch (error) {
      console.error('[TEST-AUTH] Error minting token:', error);
      res.status(500).json({
        error: { code: 'MINT_FAILED', message: 'Failed to mint test token' },
      });
    }
  });

  /**
   * GET /api/test/verify-token
   *
   * Verify a token and return its payload (for debugging/testing).
   *
   * Headers:
   *   Authorization: Bearer <token>
   *
   * Response:
   *   {
   *     "valid": true,
   *     "payload": { ... },
   *     "expiresAt": "2026-02-03T12:00:30.000Z",
   *     "remainingSeconds": 15
   *   }
   */
  router.get('/verify-token', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: { code: 'NO_TOKEN', message: 'No token provided' },
        });
        return;
      }

      const token = authHeader.substring(7);

      try {
        const decoded = jwt.verify(token, TEST_JWT_SECRET) as jwt.JwtPayload;
        const exp = decoded.exp || 0;
        const now = Math.floor(Date.now() / 1000);
        const remaining = exp - now;

        res.json({
          valid: true,
          payload: decoded,
          expiresAt: new Date(exp * 1000).toISOString(),
          remainingSeconds: Math.max(0, remaining),
          isExpired: remaining <= 0,
        });
      } catch (jwtError) {
        if (jwtError instanceof jwt.TokenExpiredError) {
          res.json({
            valid: false,
            error: 'TOKEN_EXPIRED',
            expiredAt: jwtError.expiredAt,
          });
        } else if (jwtError instanceof jwt.JsonWebTokenError) {
          res.json({
            valid: false,
            error: 'INVALID_TOKEN',
            message: jwtError.message,
          });
        } else {
          throw jwtError;
        }
      }
    } catch (error) {
      console.error('[TEST-AUTH] Error verifying token:', error);
      res.status(500).json({
        error: { code: 'VERIFY_FAILED', message: 'Failed to verify token' },
      });
    }
  });

  /**
   * POST /api/test/refresh-token
   *
   * Test the token refresh flow with a short-lived token.
   *
   * Request body:
   *   {
   *     "refreshToken": "eyJ..."
   *   }
   *
   * Response:
   *   {
   *     "success": true,
   *     "accessToken": "eyJ...",
   *     "expiresIn": 30
   *   }
   */
  router.post('/refresh-token', (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body as { refreshToken: string };

      if (!refreshToken) {
        res.status(400).json({
          error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token provided' },
        });
        return;
      }

      try {
        const decoded = jwt.verify(refreshToken, TEST_JWT_SECRET) as jwt.JwtPayload;

        // Verify it's a refresh token
        if (decoded.type !== 'refresh') {
          res.status(400).json({
            error: { code: 'NOT_REFRESH_TOKEN', message: 'Token is not a refresh token' },
          });
          return;
        }

        // Generate new access token with same TTL as original (30s default)
        const accessToken = jwt.sign(
          {
            sub: decoded.userId,
            userId: decoded.userId,
            storeId: decoded.storeId,
            phone: decoded.phone,
            role: decoded.role,
            type: 'access',
            test: true,
            refreshedAt: new Date().toISOString(),
          },
          TEST_JWT_SECRET,
          { expiresIn: 30 }
        );

        res.json({
          success: true,
          accessToken,
          expiresIn: 30,
          expiresAt: new Date(Date.now() + 30000).toISOString(),
          _testOnly: true,
        });
      } catch (jwtError) {
        if (jwtError instanceof jwt.TokenExpiredError) {
          res.status(401).json({
            error: { code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token has expired' },
          });
        } else {
          res.status(401).json({
            error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' },
          });
        }
      }
    } catch (error) {
      console.error('[TEST-AUTH] Error refreshing token:', error);
      res.status(500).json({
        error: { code: 'REFRESH_FAILED', message: 'Failed to refresh token' },
      });
    }
  });

  /**
   * GET /api/test/config
   *
   * Return test configuration for E2E tests.
   */
  router.get('/config', (_req: Request, res: Response) => {
    res.json({
      testMode: true,
      environment: process.env.NODE_ENV,
      features: {
        mintToken: true,
        verifyToken: true,
        refreshToken: true,
      },
      limits: {
        maxTtl: 300,
        defaultTtl: 30,
      },
      _warning: 'This endpoint is for testing only and is disabled in production',
    });
  });

  return router;
}
