/**
 * DEV-064: Categories Route Regression Test
 *
 * Verifies that /stores/:storeId/catalog/categories is NOT captured by
 * the /:productId route (which would cause "invalid uuid: categories" errors).
 *
 * Route ordering in catalog.ts MUST have:
 * 1. /stores/:storeId/catalog/categories - FIRST
 * 2. /stores/:storeId/catalog/:productId - SECOND
 */

import express, { Express } from 'express';
import request from 'supertest';
import catalogRoutes from '../routes/catalog';

// Mock the dependencies that require database
jest.mock('@supermandi/common', () => ({
  ApiError: class ApiError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
  },
  query: jest.fn().mockResolvedValue([
    { category: 'Groceries' },
    { category: 'Dairy' },
    { category: 'Beverages' },
  ]),
}));

jest.mock('../services/catalogService.js', () => ({
  getStoreCatalog: jest.fn().mockResolvedValue({
    products: [],
    page: 1,
    limit: 50,
    total: 0,
    hasMore: false,
  }),
  getStoreCatalogProduct: jest.fn().mockRejectedValue(
    new Error('NOT_FOUND')
  ),
}));

jest.mock('../db/queries.js', () => ({
  searchStoreProducts: jest.fn().mockResolvedValue({
    groups: [],
    total: 0,
  }),
  getStoreProductByBarcode: jest.fn().mockResolvedValue(null),
}));

jest.mock('../config.js', () => ({
  config: {
    search: {
      defaultLimit: 50,
      maxLimit: 200,
    },
  },
}));

describe('DEV-064: Categories Route Ordering', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(catalogRoutes);

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message,
        },
      });
    });
  });

  it('should return 200 for /stores/:storeId/catalog/categories', async () => {
    const storeId = '123e4567-e89b-12d3-a456-426614174000';

    const response = await request(app)
      .get(`/stores/${storeId}/catalog/categories`)
      .expect(200);

    // Verify response structure
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('should NOT return "invalid uuid: categories" error', async () => {
    const storeId = '123e4567-e89b-12d3-a456-426614174000';

    const response = await request(app)
      .get(`/stores/${storeId}/catalog/categories`)
      .expect(200);

    // The key assertion: should NOT have UUID parsing error
    expect(response.body.error?.message).not.toContain('invalid uuid');
    expect(response.body.error?.message).not.toContain('categories');
  });

  it('should return categories array', async () => {
    const storeId = '123e4567-e89b-12d3-a456-426614174000';

    const response = await request(app)
      .get(`/stores/${storeId}/catalog/categories`)
      .expect(200);

    expect(response.body.data).toEqual(['Groceries', 'Dairy', 'Beverages']);
    expect(response.body.count).toBe(3);
  });
});
