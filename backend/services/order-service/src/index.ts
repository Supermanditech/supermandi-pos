// Order Service - V3.0.9 compliant
// Purchase order management and order number generation

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ApiError, ERROR_CODES, healthCheck } from '@supermandi/common';
import { config } from './config';
import purchaseOrderRoutes from './routes/purchaseOrders';
import statusTransitionRoutes from './routes/statusTransitions';
import receiveRoutes from './routes/receive';

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
    service: 'order-service',
    version: '3.0.9',
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'order-service',
    timestamp: new Date().toISOString(),
  });
});

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get('/version', (_req: Request, res: Response) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'order-service',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

// Purchase order routes: /stores/:storeId/orders/*
app.use(purchaseOrderRoutes);

// Status transition routes: /stores/:storeId/orders/:orderId/{submit,cancel,confirm,ship}
app.use(statusTransitionRoutes);

// GRN receive routes: /stores/:storeId/orders/:orderId/receive
app.use(receiveRoutes);

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

const server = app.listen(config.port, () => {
  console.log(`
====================================================
  SuperMandi Order Service v3.0.9
  Running on port ${config.port}
  Environment: ${config.env}
====================================================
  `);
});

// T1-003: Graceful shutdown for Cloud Run SIGTERM
process.on('SIGTERM', () => {
  console.log('[order-service] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[order-service] Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
});
