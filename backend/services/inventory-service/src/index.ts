// Inventory Service - V3.0.9 compliant
// Inventory ledger and stock balance management service

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ApiError, ERROR_CODES, healthCheck, createLogger } from '@supermandi/common';
import { config } from './config';

const logger = createLogger({ service: 'inventory-service', level: process.env.LOG_LEVEL || 'info' });
import inventoryRoutes from './routes/inventory';
import transactionRoutes from './routes/transactions';
import internalRoutes from './routes/internal';

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
  logger.info(`${req.method} ${req.path}`);
  next();
});

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

app.get('/health', async (_req: Request, res: Response) => {
  const dbHealthy = await healthCheck();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'inventory-service',
    version: '3.0.9',
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'inventory-service',
    timestamp: new Date().toISOString(),
  });
});

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get('/version', (_req: Request, res: Response) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'inventory-service',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

// Inventory routes (GET /stores/:storeId/inventory/*)
app.use('/stores', inventoryRoutes);

// Transaction routes (POST /stores/:storeId/inventory/transactions, adjust)
app.use('/stores', transactionRoutes);

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
  logger.error(`[ERROR] ${err.message}`, err instanceof Error ? err : undefined);

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
  logger.info(`SuperMandi Inventory Service v3.0.9 running on port ${config.port}`, { env: config.env });
});

// T1-003: Graceful shutdown for Cloud Run SIGTERM
process.on('SIGTERM', () => {
  logger.info('[inventory-service] SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('[inventory-service] Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
});
