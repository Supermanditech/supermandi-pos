// Platform Service - V3.0.9 compliant
// Store and Feature Flag management service

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ApiError, ERROR_CODES, healthCheck } from '@supermandi/common';
import { config } from './config';
import storeRoutes from './routes/stores';
import flagRoutes from './routes/flags';
import internalRoutes from './routes/internal';
import adminRoutes from './routes/admin';
import retailerAdminRoutes from './routes/retailerAdmin';
import retailerPortalRoutes from './routes/retailerPortal';

const app = express();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

// Security headers
app.use(helmet());

// ZR-URL-001: CORS for local development only (production CORS handled by api-gateway)
if (config.env === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    // Allow localhost and LAN origins for development
    const isAllowedOrigin = origin && (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://192.168.')
    );
    if (isAllowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-admin-token, x-store-id, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });
}

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

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get('/version', (_req: Request, res: Response) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'platform-service',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

// Store routes (public + admin)
app.use('/stores', storeRoutes);
app.use('/api/v1/stores', storeRoutes); // Versioned alias

// Admin routes (SUPERADMIN only - enforced by gateway)
app.use('/admin', adminRoutes);
app.use('/api/v1/admin', adminRoutes); // Versioned alias

// Retailer admin management routes (SUPERADMIN only)
app.use('/admin', retailerAdminRoutes);
app.use('/api/v1/admin', retailerAdminRoutes); // Versioned alias

// Admin flag routes (SUPERADMIN only - enforced by gateway)
app.use('/admin/flags', flagRoutes);
app.use('/api/v1/admin/flags', flagRoutes); // Versioned alias

// Retailer portal routes (JWT auth with store_id - enforced by gateway)
// Routes are mounted at root because gateway strips /api/v1/retailer-admin prefix
app.use('/', retailerPortalRoutes);
app.use('/api/v1/retailer-admin', retailerPortalRoutes); // Versioned alias

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

const server = app.listen(config.port, () => {
  console.log(`
====================================================
  SuperMandi Platform Service v3.0.9
  Running on port ${config.port}
  Environment: ${config.env}
====================================================
  `);
});

// T1-003: Graceful shutdown for Cloud Run SIGTERM
process.on('SIGTERM', () => {
  console.log('[platform-service] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[platform-service] Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
});
