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
} from './middleware';
import { setupProxyRoutes } from './routes/proxy';
import { adminAuthRouter } from './routes/adminAuth';

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

// DEPLOY-003: CORS - allow retailer-admin dashboard (served by Nginx) to call gateway
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Token, X-Correlation-Id, x-actor-id, x-user-id, x-admin-token, X-Admin-Token');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Security headers
app.use(helmet());

// P1-001: Parse JSON bodies for PATCH/POST/PUT requests
// This allows the proxy to re-serialize and forward the body to backend services
// The proxy's onProxyReq handler will write req.body back to the proxy request
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

// =============================================================================
// GO-LIVE-008 & GO-LIVE-081: HEALTH CHECK ENDPOINTS
// Using standardized health router from common package
// =============================================================================
app.use(createHealthRouter(healthChecker));

// =============================================================================
// GO-LIVE-002: ADMIN AUTH ROUTES
// Session-based authentication with JWT tokens
// =============================================================================
app.use('/api/v1/admin/auth', adminAuthRouter);

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
