// GO-LIVE-002: Admin Authentication Routes
// Provides login/logout/refresh endpoints for admin session management
// Replaces static admin token with time-bound JWT sessions

import { Router, Request, Response } from 'express';
import {
  verifyMasterToken,
  createAdminSession,
  revokeAdminSession,
  refreshAdminSession,
  isMasterTokenConfigured,
  getActiveSessionCount,
} from '../services/adminSessionService';

// =============================================================================
// RATE LIMITING FOR LOGIN
// =============================================================================

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const LOGIN_WINDOW_MS = 60000; // 1 minute
const MAX_LOGIN_ATTEMPTS = 5;

function isLoginRateLimited(ip: string): boolean {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.count >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt(ip: string): void {
  const record = loginAttempts.get(ip);
  const now = Date.now();
  if (!record || now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }
}

function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// =============================================================================
// ROUTES
// =============================================================================

export const adminAuthRouter: Router = Router();

/**
 * POST /api/v1/admin/auth/login
 * Exchange master admin token for a session JWT
 *
 * Body: { "token": "master-admin-token" }
 * Response: { "sessionToken": "jwt...", "expiresAt": 1234567890 }
 */
adminAuthRouter.post('/login', (req: Request, res: Response): void => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  // Check rate limiting
  if (isLoginRateLimited(clientIp)) {
    console.log(`[AdminAuth] Login rate limited for IP: ${clientIp}`);
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again later.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // Check master token is configured
  if (!isMasterTokenConfigured()) {
    console.error('[AdminAuth] ADMIN_TOKEN not configured');
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Admin authentication not configured.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // Get token from body
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== 'string') {
    recordLoginAttempt(clientIp);
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Missing or invalid token in request body.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // Verify master token
  if (!verifyMasterToken(token)) {
    recordLoginAttempt(clientIp);
    console.log(`[AdminAuth] Invalid master token from IP: ${clientIp}`);
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid admin token.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  // Clear rate limit on successful auth
  clearLoginAttempts(clientIp);

  // Create session
  const session = createAdminSession(clientIp, userAgent);

  console.log(`[AdminAuth] Admin login successful from IP: ${clientIp}`);

  res.json({
    sessionToken: session.token,
    expiresAt: session.expiresAt,
    expiresIn: 8 * 60 * 60, // 8 hours in seconds
  });
});

/**
 * POST /api/v1/admin/auth/logout
 * Revoke the current admin session
 *
 * Header: Authorization: Bearer <session-token>
 */
adminAuthRouter.post('/logout', (req: Request, res: Response): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Missing Authorization header with session token.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  const token = authHeader.substring(7);
  const revoked = revokeAdminSession(token);

  if (revoked) {
    console.log(`[AdminAuth] Session revoked`);
    res.json({ success: true, message: 'Logged out successfully.' });
  } else {
    // Still return success - idempotent logout
    res.json({ success: true, message: 'Session already expired or revoked.' });
  }
});

/**
 * POST /api/v1/admin/auth/refresh
 * Refresh the current admin session token
 *
 * Header: Authorization: Bearer <session-token>
 * Response: { "sessionToken": "jwt...", "expiresAt": 1234567890 }
 */
adminAuthRouter.post('/refresh', (req: Request, res: Response): void => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Missing Authorization header with session token.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  const token = authHeader.substring(7);
  const newSession = refreshAdminSession(token, clientIp, userAgent);

  if (!newSession) {
    res.status(401).json({
      error: {
        code: 'INVALID_SESSION',
        message: 'Session expired or invalid. Please login again.',
      },
      requestId: req.correlationId,
    });
    return;
  }

  console.log(`[AdminAuth] Session refreshed for IP: ${clientIp}`);

  res.json({
    sessionToken: newSession.token,
    expiresAt: newSession.expiresAt,
    expiresIn: 8 * 60 * 60,
  });
});

/**
 * GET /api/v1/admin/auth/status
 * Check authentication status (for debugging/monitoring)
 */
adminAuthRouter.get('/status', (_req: Request, res: Response): void => {
  res.json({
    configured: isMasterTokenConfigured(),
    activeSessions: getActiveSessionCount(),
  });
});

// =============================================================================
// GO-LIVE-ADMIN-EMAIL-001: Email OTP Routes (Proxy to Backend)
// These routes proxy email OTP login requests to the main backend service
// where the actual email sending and OTP verification logic resides.
// =============================================================================

import { createProxyMiddleware } from 'http-proxy-middleware';

const mainBackendUrl = process.env.ADMIN_SERVICE_URL || process.env.BACKEND_SERVICE_URL || 'http://localhost:3010';

// Proxy middleware for email OTP routes
const emailOtpProxy = createProxyMiddleware({
  target: mainBackendUrl,
  changeOrigin: true,
  // Don't strip the path - forward as-is to /api/v1/admin/auth/*
  pathRewrite: undefined,
  onProxyReq: (proxyReq, req: Request) => {
    // Forward body for POST requests
    if (req.body && Object.keys(req.body).length > 0) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
    console.log(`[AdminAuth] Proxying email OTP request: ${req.method} ${req.path} -> ${mainBackendUrl}`);
  },
  onError: (err, _req, res) => {
    console.error('[AdminAuth] Email OTP proxy error:', err.message);
    if (!res.headersSent) {
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Email service temporarily unavailable. Please try again.',
        },
      });
    }
  },
});

/**
 * POST /api/v1/admin/auth/send-email-otp
 * GO-LIVE-ADMIN-EMAIL-001: Request OTP for admin email login
 * Proxies to backend email OTP service
 */
adminAuthRouter.post('/send-email-otp', emailOtpProxy);

/**
 * POST /api/v1/admin/auth/verify-email-otp
 * GO-LIVE-ADMIN-EMAIL-001: Verify OTP and login
 * Proxies to backend email OTP service
 */
adminAuthRouter.post('/verify-email-otp', emailOtpProxy);

/**
 * GET /api/v1/admin/auth/check
 * GO-LIVE-ADMIN-EMAIL-001: Check if admin token is valid
 * Proxies to backend auth check
 */
adminAuthRouter.get('/check', emailOtpProxy);
