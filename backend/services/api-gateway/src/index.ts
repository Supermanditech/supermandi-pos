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
import { config } from './config';
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

// Add upstream service health checks (non-critical - gateway still works if backend is down)
const mainBackendUrl = process.env.ADMIN_SERVICE_URL || 'http://localhost:3010';
healthChecker.addHttpCheck('main-backend', `${mainBackendUrl}/api/v1/admin/health`, {
  timeoutMs: 5000,
  critical: false, // Gateway can still serve some requests even if backend is down
});

const app = express();

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

  // Check if the origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (config.env === 'development' && !origin) {
    // Allow requests without origin header in development (curl, Postman, etc.)
    res.header('Access-Control-Allow-Origin', '*');
  }
  // Note: If origin not in allowedOrigins, we don't set the header (browser will block)

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Token, X-Correlation-Id, x-actor-id, x-user-id, x-admin-token, X-Admin-Token, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Security headers
app.use(helmet());

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
    console.log(`[GO-LIVE-194] Body check: path=${req.path}, size=${bodySize}, limit=${limit}, over=${bodySize > limit}`);
    if (bodySize > limit) {
      const limitKb = Math.round(limit / 1024);
      // GO-LIVE-194: Structured logging for body size rejection
      console.log(JSON.stringify({
        event: 'body_too_large',
        path: req.path,
        method: req.method,
        contentLength: bodySize,
        limit,
        ip: req.ip || 'unknown',
      }));
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

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get('/version', (_req, res) => {
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
// TEST AUTH ROUTES - Only enabled in non-production environments
// Provides: /api/test/mint-token, /api/test/verify-token, /api/test/refresh-token
// Used for automated E2E testing of token refresh flows
// =============================================================================
app.use('/api/test', createTestAuthRouter());

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
