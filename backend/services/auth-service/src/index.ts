// Auth Service - V3.0.9 compliant
// User and Role CRUD service with bcrypt password hashing

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ApiError, ERROR_CODES, healthCheck, initializeFirebase, createLogger } from '@supermandi/common';
import { config } from './config';
import internalRoutes from './routes/internal';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import retailerAuthRoutes from './routes/retailerAuth';

const logger = createLogger({ service: 'auth-service', level: process.env.LOG_LEVEL || 'info' });

// =============================================================================
// FIREBASE INITIALIZATION
// =============================================================================

if (config.firebase.enabled) {
  try {
    initializeFirebase({
      serviceAccountPath: config.firebase.serviceAccountPath,
      projectId: config.firebase.projectId,
    });
    logger.info('[Auth Service] Firebase Admin SDK initialized');
  } catch (error) {
    logger.error('[Auth Service] Failed to initialize Firebase:', error instanceof Error ? error : undefined);
    // Don't crash the service - retailer auth will fail gracefully
  }
} else {
  logger.info('[Auth Service] Firebase disabled (FIREBASE_ENABLED != true)');
}

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
    service: 'auth-service',
    version: '3.0.9',
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
  });
});

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get('/version', (_req: Request, res: Response) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'auth-service',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

// Public auth routes (login, logout)
app.use('/auth', authRoutes);

// Retailer admin auth routes (Firebase token exchange)
// Mounted at root because gateway strips /api/v1/retailer-admin/auth prefix
app.use('/', retailerAuthRoutes);

// Admin routes (SUPERADMIN only - enforced by gateway)
app.use('/admin', adminRoutes);

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
  logger.info('Auth Service started', {
    port: config.port,
    environment: config.env,
    version: '3.0.9',
  });
});

// ISSUE-MICRO-008: Graceful shutdown on SIGTERM/SIGINT (Cloud Run sends SIGTERM)
const shutdown = (signal: string) => {
  logger.info(`[Auth Service] ${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info('[Auth Service] Server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    logger.warn('[Auth Service] Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
