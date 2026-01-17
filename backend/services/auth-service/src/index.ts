// Auth Service - V3.0.9 compliant
// User and Role CRUD service with bcrypt password hashing

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ApiError, ERROR_CODES, healthCheck, initializeFirebase } from '@supermandi/common';
import { config } from './config';
import internalRoutes from './routes/internal';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import retailerAuthRoutes from './routes/retailerAuth';

// =============================================================================
// FIREBASE INITIALIZATION
// =============================================================================

if (config.firebase.enabled) {
  try {
    initializeFirebase({
      serviceAccountPath: config.firebase.serviceAccountPath,
      projectId: config.firebase.projectId,
    });
    console.log('[Auth Service] Firebase Admin SDK initialized');
  } catch (error) {
    console.error('[Auth Service] Failed to initialize Firebase:', error);
    // Don't crash the service - retailer auth will fail gracefully
  }
} else {
  console.log('[Auth Service] Firebase disabled (FIREBASE_ENABLED != true)');
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
  SuperMandi Auth Service v3.0.9
  Running on port ${config.port}
  Environment: ${config.env}
====================================================
  `);
});
