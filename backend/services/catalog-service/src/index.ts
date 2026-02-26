// Catalog Service - V3.0.9 compliant
// Product catalog, search, and caching

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ApiError, ERROR_CODES, healthCheck, createLogger } from '@supermandi/common';
import { config } from './config';
import { redisHealthCheck, closeRedis } from './cache/redis';
import {
  searchProductsService,
  getProductByIdService,
  getProductByBarcodeService,
  searchSupplierProductsService,
  getSupplierProductByIdService,
} from './services/searchService';
import catalogRoutes from './routes/catalog';
import mappingRoutes from './routes/mapping';
import internalRoutes from './routes/internal';
import { startInventoryConsumer, stopInventoryConsumer } from './consumers/inventoryConsumer';

const logger = createLogger({ service: 'catalog-service', level: process.env.LOG_LEVEL || 'info' });

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
  const redisHealthy = await redisHealthCheck();

  const isHealthy = dbHealthy && redisHealthy;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'catalog-service',
    version: '3.0.9',
    database: dbHealthy ? 'connected' : 'disconnected',
    redis: redisHealthy ? 'connected' : 'disconnected',
  });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'catalog-service',
    timestamp: new Date().toISOString(),
  });
});

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get('/version', (_req: Request, res: Response) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'catalog-service',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

// =============================================================================
// SEARCH ENDPOINTS
// =============================================================================

/**
 * GET /products/search
 * Search master catalog products using trigram similarity.
 *
 * Query params:
 * - q: Search query (required, min 2 chars)
 * - limit: Max results (default 50, max 200)
 * - offset: Pagination offset (default 0)
 * - category: Filter by category (optional)
 */
app.get('/products/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || config.search.defaultLimit;
    const offset = parseInt(req.query.offset as string) || 0;
    const category = req.query.category as string | undefined;

    if (!q || q.trim().length < 2) {
      throw new ApiError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Search query (q) must be at least 2 characters'
      );
    }

    const result = await searchProductsService({
      query: q,
      limit,
      offset,
      category,
    });

    res.json({
      success: true,
      data: result.products,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.products.length < result.total,
      },
      query: result.query,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /products/:productId
 * Get a product by ID.
 */
app.get('/products/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;

    const product = await getProductByIdService(productId);

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /products/barcode/:barcode
 * Get a product by barcode.
 */
app.get('/products/barcode/:barcode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { barcode } = req.params;

    const product = await getProductByBarcodeService(barcode);

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /suppliers/:supplierId/products/search
 * Search a supplier's products using trigram similarity.
 *
 * Query params:
 * - q: Search query (required, min 2 chars)
 * - limit: Max results (default 50, max 200)
 * - offset: Pagination offset (default 0)
 */
app.get(
  '/suppliers/:supplierId/products/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplierId } = req.params;
      const q = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || config.search.defaultLimit;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!q || q.trim().length < 2) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Search query (q) must be at least 2 characters'
        );
      }

      const result = await searchSupplierProductsService({
        supplierId,
        query: q,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: result.products,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.products.length < result.total,
        },
        query: result.query,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /supplier-products/:supplierProductId
 * Get a supplier product by ID.
 */
app.get(
  '/supplier-products/:supplierProductId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplierProductId } = req.params;

      const product = await getSupplierProductByIdService(supplierProductId);

      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// STORE CATALOG ROUTES (DEV-025)
// =============================================================================

app.use(catalogRoutes);
app.use(mappingRoutes);

// =============================================================================
// INTERNAL ROUTES (DEV-034)
// =============================================================================

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
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await stopInventoryConsumer();
  await closeRedis();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await stopInventoryConsumer();
  await closeRedis();
  process.exit(0);
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(config.port, () => {
  // Start inventory event consumer
  startInventoryConsumer();

  logger.info('Catalog Service started', {
    port: config.port,
    environment: config.env,
    version: '3.0.9',
  });
});
