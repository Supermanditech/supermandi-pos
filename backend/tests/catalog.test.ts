// Catalog Service Tests - V3.0.9 compliant
// Product catalog and supplier integration tests

import request from 'supertest';
import { TEST_IDS, TEST_CREDENTIALS, getTestAuthHeaders } from './setup';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

describe('Catalog Service', () => {
  let authToken: string;

  beforeAll(async () => {
    const response = await request(API_GATEWAY_URL)
      .post('/api/auth/login')
      .send({
        phone: TEST_CREDENTIALS.staffPhone,
        pin: TEST_CREDENTIALS.staffPin,
        deviceFingerprint: TEST_CREDENTIALS.deviceFingerprint
      });

    authToken = response.body.data.token;
  });

  // ===========================================================================
  // PRODUCT CATALOG TESTS
  // ===========================================================================
  describe('GET /api/catalog/stores/:storeId/products', () => {
    it('should list products for store', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/catalog/stores/${TEST_IDS.storeId}/products`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      const product = response.body.data[0];
      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('name');
      expect(product).toHaveProperty('barcode');
      expect(product).toHaveProperty('unit');
      expect(product).toHaveProperty('mrp');
    });

    it('should search products by name', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/catalog/stores/${TEST_IDS.storeId}/products`)
        .query({ search: 'Test Product' })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((product: any) => {
        expect(product.name.toLowerCase()).toContain('test');
      });
    });

    it('should search products by barcode', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/catalog/stores/${TEST_IDS.storeId}/products`)
        .query({ barcode: '8901234567890' })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].barcode).toBe('8901234567890');
    });

    it('should filter by category', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/catalog/stores/${TEST_IDS.storeId}/products`)
        .query({ categoryId: TEST_IDS.categoryId })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.forEach((product: any) => {
        expect(product.categoryId).toBe(TEST_IDS.categoryId);
      });
    });

    it('should paginate results', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/catalog/stores/${TEST_IDS.storeId}/products`)
        .query({ limit: 1, offset: 0 })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
    });
  });

  // ===========================================================================
  // SINGLE PRODUCT TESTS
  // ===========================================================================
  describe('GET /api/catalog/stores/:storeId/products/:productId', () => {
    it('should get product by ID', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/catalog/stores/${TEST_IDS.storeId}/products/${TEST_IDS.productId1}`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(TEST_IDS.productId1);
      expect(response.body.data.name).toBe('Test Product 1');
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/catalog/stores/${TEST_IDS.storeId}/products/00000000-0000-0000-0000-000000000999`)
        .set(getTestAuthHeaders(authToken))
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // CATEGORY TESTS
  // ===========================================================================
  describe('GET /api/catalog/stores/:storeId/categories', () => {
    it('should list categories', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/catalog/stores/${TEST_IDS.storeId}/categories`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      const category = response.body.data.find((c: any) => c.id === TEST_IDS.categoryId);
      expect(category).toBeDefined();
      expect(category.name).toBe('Test Category');
    });
  });

  // ===========================================================================
  // SUPPLIER LIST TESTS
  // ===========================================================================
  describe('GET /api/supplier/stores/:storeId/suppliers', () => {
    it('should list suppliers for store', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      const supplier = response.body.data.find((s: any) => s.id === TEST_IDS.supplierId);
      expect(supplier).toBeDefined();
      expect(supplier.name).toBe('Test Supplier');
      expect(supplier.minOrderValue).toBe(500);
    });

    it('should search suppliers by name', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers`)
        .query({ search: 'Test' })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // SUPPLIER CATALOG TESTS
  // ===========================================================================
  describe('GET /api/supplier/stores/:storeId/suppliers/:supplierId/catalog', () => {
    it('should get supplier catalog', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers/${TEST_IDS.supplierId}/catalog`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      const product = response.body.data[0];
      expect(product).toHaveProperty('supplierProductId');
      expect(product).toHaveProperty('productId');
      expect(product).toHaveProperty('productName');
      expect(product).toHaveProperty('sku');
      expect(product).toHaveProperty('unitPrice');
      expect(product).toHaveProperty('moq');
      expect(product).toHaveProperty('isAvailable');
    });

    it('should search supplier catalog', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers/${TEST_IDS.supplierId}/catalog`)
        .query({ search: 'Test Product' })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should filter by availability', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers/${TEST_IDS.supplierId}/catalog`)
        .query({ available: true })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.forEach((product: any) => {
        expect(product.isAvailable).toBe(true);
      });
    });

    it('should return 404 for non-existent supplier', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers/00000000-0000-0000-0000-000000000999/catalog`)
        .set(getTestAuthHeaders(authToken))
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // SUPPLIER DETAILS TESTS
  // ===========================================================================
  describe('GET /api/supplier/stores/:storeId/suppliers/:supplierId', () => {
    it('should get supplier details', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers/${TEST_IDS.supplierId}`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(TEST_IDS.supplierId);
      expect(response.body.data.name).toBe('Test Supplier');
      expect(response.body.data.minOrderValue).toBe(500);
      expect(response.body.data.leadDays).toBe(2);
    });
  });
});
