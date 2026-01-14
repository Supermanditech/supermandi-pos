// Platform Service - V3.0.9 compliant
// Store and Feature Flag management service

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ApiError, ERROR_CODES, healthCheck } from '@supermandi/common';
import { config } from './config.js';
import storeRoutes from './routes/stores.js';
import flagRoutes from './routes/flags.js';
import internalRoutes from './routes/internal.js';
import adminRoutes from './routes/admin.js';

const app = express();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

// Security headers
app.use(helmet());

// Parse JSON bodies
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

app.get('/health', async (_req: Request, res: Response) => {
  const dbHealthy = await healthCheck();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'platform-service',
    version: '3.0.9',
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'platform-service',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

// Store routes (public + admin)
app.use('/stores', storeRoutes);

// Admin routes (SUPERADMIN only - enforced by gateway)
app.use('/admin', adminRoutes);

// Admin flag routes (SUPERADMIN only - enforced by gateway)
app.use('/admin/flags', flagRoutes);

// Internal routes (service-to-service)
app.use('/internal', internalRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR] ${err.message}`, err.stack);

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(config.port, () => {
  console.log(`
====================================================
  SuperMandi Platform Service v3.0.9
  Running on port ${config.port}
  Environment: ${config.env}
====================================================
  `);
});
