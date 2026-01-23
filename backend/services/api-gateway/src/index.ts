// API Gateway - V3.0.9 compliant
// Main entry point for all backend API requests

import express from 'express';
import helmet from 'helmet';
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

const app = express();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

// DEPLOY-003: CORS - allow retailer-admin dashboard (served by Nginx) to call gateway
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Token, X-Correlation-Id, x-actor-id, x-user-id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Security headers
app.use(helmet());

// Correlation ID (must be first for logging)
app.use(correlationIdMiddleware);

// Request logging
app.use(requestLoggerMiddleware);

// Rate limiting
app.use(rateLimiterMiddleware);

// Strip any client-provided auth headers (prevents spoofing)
app.use(stripClientAuthHeaders);

// JWT authentication for protected routes (retailer-admin)
app.use(jwtAuthMiddleware);

// SEC-ADMIN-001: Admin authentication for /api/v1/admin/* routes (superadmin)
app.use(adminAuthMiddleware);

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

// Kubernetes-style health check
app.get('/healthz', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  });
});

// Legacy health check (backward compatibility)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'api-gateway',
    version: '3.0.9',
  });
});

// =============================================================================
// PROXY ROUTES
// =============================================================================

// Setup proxy routes to backend services
app.use(setupProxyRoutes());

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    requestId: req.correlationId,
  });
});

// Global error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(`[ERROR] ${req.correlationId}: ${err.message}`, err.stack);

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
      requestId: req.correlationId,
    });
  }
);

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(config.port, () => {
  console.log(`
====================================================
  SuperMandi API Gateway v3.0.9
  Running on port ${config.port}
  Environment: ${config.env}
====================================================
  `);
});
