// API Gateway - V3.0.11 compliant
// Main entry point for all backend API requests
// P1-001: Added JSON body parsing for PATCH/POST/PUT request forwarding
// GO-LIVE Batch 0: Added structured logging, health checks, timeout, error handling

import express from 'express';
import helmet from 'helmet';
import {
  createLogger,
  createHealthChecker,
  createHealthRouter,
  requestTimeout,
  errorHandler,
  notFoundHandler,
} from '@supermandi/common';
import { config, getMainBackendUrl } from './config';
import {
  correlationIdMiddleware,
  requestLoggerMiddleware,
  rateLimiterMiddleware,
  stripClientAuthHeaders,
  jwtAuthMiddleware,
  adminAuthMiddleware,
  actorTypeMiddleware,
  csrfProtectionMiddleware,
} from './middleware';
import { setupProxyRoutes } from './routes/proxy';
import { adminAuthRouter } from './routes/adminAuth';
import { createTestAuthRouter } from './routes/testAuth';

// =============================================================================
// GO-LIVE-079: STRUCTURED LOGGING
// =============================================================================
const logger = createLogger({
  service: 'api-gateway',
  level: process.env.LOG_LEVEL || 'info',
});

// =============================================================================
// GO-LIVE-081: HEALTH CHECKER WITH UPSTREAM SERVICE CHECKS
// =============================================================================
const healthChecker = createHealthChecker({
  service: 'api-gateway',
  version: '3.0.11',
});

// LIVE.GW.MAIN_BACKEND_URL_FAIL_FAST.001: Use config (fail-fast) instead of inline localhost fallback
const mainBackendUrl = getMainBackendUrl();
healthChecker.addHttpCheck('main-backend', `${mainBackendUrl}/api/v1/admin/health`, {
  timeoutMs: 5000,
  critical: false, // Gateway can still serve some requests even if backend is down
});

const app = express();

// LIVE.GW.TRUST_PROXY_CLOUD_RUN.001: Enable trust proxy for Cloud Run (behind LB)
// Cloud Run always sits behind Google's load balancer; trust proxy is required for correct
// client IP (req.ip) and protocol (req.protocol) via X-Forwarded-For/X-Forwarded-Proto
if (config.env !== 'development') {
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));
}

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

// =============================================================================
// GO-LIVE-073: CORS - Restrict to allowed origins (no wildcard in production)
// =============================================================================
// ZR-URL-001: All CORS origins from environment (zero hardcoded URLs)
// Production: CORS_ALLOWED_ORIGINS="https://supermandi.tech,https://www.supermandi.tech"
// Development: falls back to CORS_DEV_ORIGINS or standard local dev origins
const corsEnvOrigins = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins: string[] = corsEnvOrigins.length > 0
  ? corsEnvOrigins
  : config.env !== 'development'
    ? [] // Production without CORS_ALLOWED_ORIGINS: no cross-origin requests allowed
    : (process.env.CORS_DEV_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:8081,http://127.0.0.1:3000,http://127.0.0.1:5173').split(',').map(s => s.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  let originAllowed = false;

  // Check if the origin is allowed
  // STAGING-FIX-005: Support '*' wildcard in CORS_ALLOWED_ORIGINS
  // PRA-REAUDIT: Block wildcard + credentials in production (any-origin auth bypass)
  if (config.env === 'production' && allowedOrigins.includes('*')) {
    logger.error('[CORS] FATAL: Wildcard CORS_ALLOWED_ORIGINS is forbidden in production');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }
  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
    originAllowed = true;
  } else if ((config.env === 'development' || allowedOrigins.includes('*')) && !origin) {
    // Allow requests without origin header in development or wildcard mode (curl, Postman, etc.)
    res.header('Access-Control-Allow-Origin', '*');
    originAllowed = true;
  }

  // SEC-006: Only send CORS headers when origin is allowed — prevents leaking config to unauthorized origins
  if (originAllowed) {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    // LIVE.GW.CORS_INTERNAL_HEADER_EXPOSURE.001: Only expose client-facing headers, not internal ones
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Token, X-Correlation-Id, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    // REQ.AUDIT.W5.BACKEND.CORS-CACHE-TOO-LONG.001: 1h preflight cache
    res.header('Access-Control-Max-Age', '3600');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(originAllowed ? 204 : 403);
    return;
  }
  next();
});

// LIVE.GW.SUPPLIER_REGISTER_TRAILING_SLASH_PARITY.001: Normalize trailing slashes on API routes
// Removes trailing slashes to ensure consistent routing (e.g., /auth/register/ → /auth/register)
app.use((req, _res, next) => {
  if (req.path.length > 1 && req.path.endsWith('/') && req.path.startsWith('/api/')) {
    req.url = req.url.replace(/\/(\?|$)/, '$1');
  }
  next();
});

// ISSUE-MICRO-033: Explicit security headers — HSTS, X-Frame-Options, etc.
app.use(helmet({
  hsts: {
    maxAge: 31536000, // 1 year (default is 180 days)
    includeSubDomains: true,
  },
  frameguard: { action: 'deny' },
  // LIVE.SECURITY.CSP_API.001: API-only CSP — no resource loading, no framing
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Cross-origin assets (fonts, images)
}));

// =============================================================================
// GO-LIVE-194: Per-endpoint body size limits
// Prevents DoS via large payloads while allowing legitimate large uploads
// =============================================================================
const ENDPOINT_SIZE_LIMITS: { pattern: RegExp; limit: number }[] = [
  // DOCS-001: Document upload: 10MB
  { pattern: /\/documents\/upload/, limit: 10 * 1024 * 1024 },
  // Voice/Audio: 5MB
  { pattern: /\/voice\//, limit: 5 * 1024 * 1024 },
  { pattern: /\/ai\/voice/, limit: 5 * 1024 * 1024 },
  // Images: 2MB
  { pattern: /\/upload\/image/, limit: 2 * 1024 * 1024 },
  { pattern: /\/products\/.*\/image/, limit: 2 * 1024 * 1024 },
  // Batch/sync: 500KB
  { pattern: /\/batch/, limit: 500 * 1024 },
  { pattern: /\/sync/, limit: 500 * 1024 },
  // Sales: 200KB
  { pattern: /\/sales/, limit: 200 * 1024 },
  // Auth/enroll: 50KB
  { pattern: /\/enroll$/, limit: 50 * 1024 },
  { pattern: /\/auth\//, limit: 50 * 1024 },
];
const DEFAULT_BODY_LIMIT = 100 * 1024; // 100KB default

function getBodyLimitForPath(path: string): number {
  for (const { pattern, limit } of ENDPOINT_SIZE_LIMITS) {
    if (pattern.test(path)) return limit;
  }
  return DEFAULT_BODY_LIMIT;
}

// Check Content-Length before body parsing
app.use((req, res, next) => {
  const contentLength = req.headers['content-length'];
  if (contentLength) {
    const bodySize = parseInt(contentLength, 10);
    const limit = getBodyLimitForPath(req.path);
    logger.info(`[GO-LIVE-194] Body check: path=${req.path}, size=${bodySize}, limit=${limit}, over=${bodySize > limit}`);
    if (bodySize > limit) {
      const limitKb = Math.round(limit / 1024);
      // GO-LIVE-194: Structured logging for body size rejection
      logger.info('body_too_large', {
        event: 'body_too_large',
        path: req.path,
        method: req.method,
        contentLength: bodySize,
        limit,
        ip: req.ip || 'unknown',
      });
      res.status(413).json({
        error: {
          code: 'BODY_TOO_LARGE',
          message: `Request body exceeds the ${limitKb}kb limit for this endpoint.`,
          limit: `${limitKb}kb`,
          received: `${Math.ceil(bodySize / 1024)}kb`,
        },
      });
      return;
    }
  }
  next();
});

// P1-001: Parse JSON bodies for PATCH/POST/PUT requests
// This allows the proxy to re-serialize and forward the body to backend services
// The proxy's onProxyReq handler will write req.body back to the proxy request
// Note: Using 10mb as fallback since per-endpoint limit is checked above
app.use(express.json({ limit: '10mb' }));

// Correlation ID (must be first for logging)
app.use(correlationIdMiddleware);

// Request logging
app.use(requestLoggerMiddleware);

// GO-LIVE-056: Request timeout handling (30 seconds default)
app.use(requestTimeout({
  timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
  skipPaths: ['/health', '/healthz', '/ready', '/metrics'],
}));

// Rate limiting
app.use(rateLimiterMiddleware);

// T1-011: Stricter rate limit for auth endpoints (5/min vs 30/min general)
import { authRateLimiter, adminRateLimiter } from './middleware/rateLimiter';
app.use('/api/v1/auth', authRateLimiter);
app.use('/api/v1/retailer-admin/auth', authRateLimiter);
app.use('/api/v1/supplier/auth', authRateLimiter);

// PRA-REAUDIT: Mount admin rate limiter (was exported but never used)
app.use('/api/v1/admin', adminRateLimiter);

// Strip any client-provided auth headers (prevents spoofing)
app.use(stripClientAuthHeaders);

// JWT authentication for protected routes (retailer-admin)
app.use(jwtAuthMiddleware);

// SEC-ADMIN-001: Admin authentication for /api/v1/admin/* routes (superadmin)
app.use(adminAuthMiddleware);

// AUTH-GATEWAY-001 + AUTH-PERM-001: Actor type enforcement
// Prevents cross-portal access (e.g., supplier JWT accessing retailer routes)
app.use(actorTypeMiddleware);

// AUTH-CSRF-001: CSRF protection for state-changing requests
// Requires X-Requested-With header or application/json Content-Type
app.use(csrfProtectionMiddleware);

// =============================================================================
// GO-LIVE-008 & GO-LIVE-081: HEALTH CHECK ENDPOINTS
// Using standardized health router from common package
// =============================================================================
app.use(createHealthRouter(healthChecker));

// RET-AUD-025: Also mount health endpoints under /api/v1/ for nginx proxy compatibility
app.use('/api/v1', createHealthRouter(healthChecker));

// FIX-001: Mount health under /api/ so /api/health returns 200 (LB routes /api/* → api-gateway)
app.use('/api', createHealthRouter(healthChecker));

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get('/version', (_req, res) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'api-gateway',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

// STAGING-GATE-004: /api/v1/version for LB path rule /api/*
app.get('/api/v1/version', (_req, res) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'api-gateway',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

// =============================================================================
// GO-LIVE-002: ADMIN AUTH ROUTES
// Session-based authentication with JWT tokens
// =============================================================================
app.use('/api/v1/admin/auth', adminAuthRouter);

// =============================================================================
// TEST AUTH ROUTES - Only enabled in development
// LIVE.BE.TEST_AUTH_ROUTE_PROD_GUARD.001: Double-guard at mount point
// Provides: /api/test/mint-token, /api/test/verify-token, /api/test/refresh-token
// Used for automated E2E testing of token refresh flows
// =============================================================================
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test', createTestAuthRouter());
}

// =============================================================================
// PROXY ROUTES
// =============================================================================

// Setup proxy routes to backend services
app.use(setupProxyRoutes());

// =============================================================================
// GO-LIVE-055: STANDARDIZED ERROR HANDLING
// =============================================================================

// 404 handler
app.use(notFoundHandler());

// Global error handler with structured logging
app.use(errorHandler({
  logger,
  service: 'api-gateway',
  includeStack: config.env === 'development',
}));

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(config.port, () => {
  logger.info('API Gateway started', {
    port: config.port,
    environment: config.env,
    version: '3.0.11',
    features: ['PATCH/POST/PUT body forwarding', 'structured logging', 'health checks', 'timeout handling'],
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
