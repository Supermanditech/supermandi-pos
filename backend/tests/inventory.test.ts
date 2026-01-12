// Inventory Service Tests - V3.0.9 compliant
// Inventory management and GRN integration tests

import request from 'supertest';
import { testPool, TEST_IDS, TEST_CREDENTIALS, getTestAuthHeaders, generateIdempotencyKey } from './setup';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

describe('Inventory Service', () => {
  let authToken: string;

  beforeAll(async () => {
    // Login to get auth token
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
  // INVENTORY QUERY TESTS
  // ===========================================================================
  describe('GET /api/inventory/stores/:storeId/inventory', () => {
    it('should list inventory for store', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/inventory`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      const item = response.body.data[0];
      expect(item).toHaveProperty('productId');
      expect(item).toHaveProperty('productName');
      expect(item).toHaveProperty('quantity');
      expect(item).toHaveProperty('reservedQuantity');
    });

    it('should filter by low stock', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/inventory`)
        .query({ lowStock: true })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should search inventory by product name', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/inventory`)
        .query({ search: 'Test Product' })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should paginate results', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/inventory`)
        .query({ limit: 1, offset: 0 })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.limit).toBe(1);
    });
  });

  // ===========================================================================
  // SINGLE PRODUCT INVENTORY
  // ===========================================================================
  describe('GET /api/inventory/stores/:storeId/inventory/:productId', () => {
    it('should get inventory for specific product', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/inventory/${TEST_IDS.productId1}`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.productId).toBe(TEST_IDS.productId1);
      expect(response.body.data.quantity).toBeGreaterThanOrEqual(0);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/inventory/00000000-0000-0000-0000-000000000999`)
        .set(getTestAuthHeaders(authToken))
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // INVENTORY ADJUSTMENT TESTS
  // ===========================================================================
  describe('POST /api/inventory/stores/:storeId/inventory/:productId/adjust', () => {
    it('should adjust inventory with reason', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/inventory/stores/${TEST_IDS.storeId}/inventory/${TEST_IDS.productId1}/adjust`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', generateIdempotencyKey())
        .send({
          quantityChange: -5,
          reason: 'damaged',
          notes: 'Test adjustment - items damaged'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.previousQuantity).toBeDefined();
      expect(response.body.data.newQuantity).toBeDefined();
      expect(response.body.data.newQuantity).toBe(response.body.data.previousQuantity - 5);
    });

    it('should reject adjustment without reason', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/inventory/stores/${TEST_IDS.storeId}/inventory/${TEST_IDS.productId1}/adjust`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', generateIdempotencyKey())
        .send({
          quantityChange: -1
          // Missing reason
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject negative inventory', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/inventory/stores/${TEST_IDS.storeId}/inventory/${TEST_IDS.productId1}/adjust`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', generateIdempotencyKey())
        .send({
          quantityChange: -99999,
          reason: 'test',
          notes: 'Should fail'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toMatch(/INSUFFICIENT|NEGATIVE/i);
    });
  });

  // ===========================================================================
  // INVENTORY LEDGER TESTS
  // ===========================================================================
  describe('GET /api/inventory/stores/:storeId/inventory/:productId/ledger', () => {
    it('should get inventory ledger entries', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/inventory/${TEST_IDS.productId1}/ledger`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);

      if (response.body.data.length > 0) {
        const entry = response.body.data[0];
        expect(entry).toHaveProperty('transactionType');
        expect(entry).toHaveProperty('quantityChange');
        expect(entry).toHaveProperty('quantityAfter');
        expect(entry).toHaveProperty('createdAt');
      }
    });

    it('should filter ledger by date range', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/inventory/${TEST_IDS.productId1}/ledger`)
        .query({ startDate, endDate })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // ===========================================================================
  // GRN TESTS
  // ===========================================================================
  describe('GRN Operations', () => {
    let testGrnId: string;

    it('should list GRNs for store', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/grns`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should create standalone GRN (without PO)', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/inventory/stores/${TEST_IDS.storeId}/grns`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', generateIdempotencyKey())
        .send({
          supplierId: TEST_IDS.supplierId,
          items: [
            {
              productId: TEST_IDS.productId1,
              quantityReceived: 5
            }
          ],
          notes: 'Direct delivery - no PO'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe('completed');

      testGrnId = response.body.data.id;
    });

    it('should get GRN by ID', async () => {
      if (!testGrnId) {
        console.log('Skipping - no GRN ID');
        return;
      }

      const response = await request(API_GATEWAY_URL)
        .get(`/api/inventory/stores/${TEST_IDS.storeId}/grns/${testGrnId}`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testGrnId);
      expect(response.body.data.items).toBeInstanceOf(Array);
    });

    it('should have created ledger entry for GRN', async () => {
      if (!testGrnId) {
        console.log('Skipping - no GRN ID');
        return;
      }

      const result = await testPool.query(`
        SELECT * FROM inventory_ledger
        WHERE store_id = $1
        AND reference_type = 'grn'
        AND reference_id = $2
      `, [TEST_IDS.storeId, testGrnId]);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].transaction_type).toBe('receipt');
    });
  });
});
