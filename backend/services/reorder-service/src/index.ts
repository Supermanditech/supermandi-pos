// Reorder Service - V3.0.9 compliant
// Store reorder settings and policies management

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ApiError, ERROR_CODES, healthCheck, createLogger } from '@supermandi/common';
import { config } from './config';

const logger = createLogger({ service: 'reorder-service', level: process.env.LOG_LEVEL || 'info' });
import settingsRoutes from './routes/settings';
import policiesRoutes from './routes/policies';
import pendingRoutes from './routes/pending';
import { startInventoryConsumer, stopInventoryConsumer } from './consumers/inventoryConsumer';
import { startStockMonitor, stopStockMonitor } from './jobs/stockMonitor';

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
    service: 'reorder-service',
    version: '3.0.9',
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'reorder-service',
    timestamp: new Date().toISOString(),
  });
});

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get('/version', (_req: Request, res: Response) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'reorder-service',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

// =============================================================================
// ROUTES
// =============================================================================

app.use(settingsRoutes);
app.use(policiesRoutes);
app.use(pendingRoutes);

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
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopStockMonitor();
  await stopInventoryConsumer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  stopStockMonitor();
  await stopInventoryConsumer();
  process.exit(0);
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(config.port, () => {
  // Start inventory event consumer
  startInventoryConsumer();

  // Start stock monitor cron job
  startStockMonitor();

  logger.info('SuperMandi Reorder Service v3.0.9 started', { port: config.port, env: config.env });
});
