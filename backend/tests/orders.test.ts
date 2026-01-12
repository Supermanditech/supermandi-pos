// Order Service Tests - V3.0.9 compliant
// Purchase order management integration tests

import request from 'supertest';
import { TEST_IDS, TEST_CREDENTIALS, getTestAuthHeaders, generateIdempotencyKey } from './setup';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

describe('Order Service', () => {
  let authToken: string;
  let testPurchaseOrderId: string;

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
  // PURCHASE ORDER LIST
  // ===========================================================================
  describe('GET /api/orders/stores/:storeId/purchase-orders', () => {
    it('should list purchase orders for store', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should filter by status', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .query({ status: 'draft' })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.forEach((po: any) => {
        expect(po.status).toBe('draft');
      });
    });

    it('should filter by supplier', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .query({ supplierId: TEST_IDS.supplierId })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.forEach((po: any) => {
        expect(po.supplierId).toBe(TEST_IDS.supplierId);
      });
    });

    it('should paginate results', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .query({ limit: 5, offset: 0 })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });
  });

  // ===========================================================================
  // PURCHASE ORDER CREATION
  // ===========================================================================
  describe('POST /api/orders/stores/:storeId/purchase-orders', () => {
    it('should create draft purchase order', async () => {
      const idempotencyKey = generateIdempotencyKey();

      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', idempotencyKey)
        .send({
          supplierId: TEST_IDS.supplierId,
          items: [
            {
              productId: TEST_IDS.productId1,
              supplierProductId: TEST_IDS.supplierProductId1,
              quantity: 15,
              unitPrice: 80.00
            }
          ],
          notes: 'Test order'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.supplierId).toBe(TEST_IDS.supplierId);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.totalAmount).toBe(1200); // 15 * 80

      testPurchaseOrderId = response.body.data.id;
    });

    it('should validate MOQ', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', generateIdempotencyKey())
        .send({
          supplierId: TEST_IDS.supplierId,
          items: [
            {
              productId: TEST_IDS.productId1,
              supplierProductId: TEST_IDS.supplierProductId1,
              quantity: 5, // Below MOQ of 10
              unitPrice: 80.00
            }
          ]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate minimum order value', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', generateIdempotencyKey())
        .send({
          supplierId: TEST_IDS.supplierId,
          items: [
            {
              productId: TEST_IDS.productId2,
              supplierProductId: TEST_IDS.supplierProductId2,
              quantity: 5, // 5 * 40 = 200, below min order value of 500
              unitPrice: 40.00
            }
          ]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toMatch(/MIN_ORDER|VALIDATION/i);
    });

    it('should require valid supplier', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', generateIdempotencyKey())
        .send({
          supplierId: '00000000-0000-0000-0000-000000000999', // Non-existent
          items: [
            {
              productId: TEST_IDS.productId1,
              quantity: 10,
              unitPrice: 80.00
            }
          ]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should require at least one item', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', generateIdempotencyKey())
        .send({
          supplierId: TEST_IDS.supplierId,
          items: []
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // PURCHASE ORDER RETRIEVAL
  // ===========================================================================
  describe('GET /api/orders/stores/:storeId/purchase-orders/:id', () => {
    it('should get purchase order by ID', async () => {
      if (!testPurchaseOrderId) {
        console.log('Skipping - no PO ID');
        return;
      }

      const response = await request(API_GATEWAY_URL)
        .get(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${testPurchaseOrderId}`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testPurchaseOrderId);
      expect(response.body.data.items).toBeInstanceOf(Array);
    });

    it('should return 404 for non-existent order', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/00000000-0000-0000-0000-000000000999`)
        .set(getTestAuthHeaders(authToken))
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // PURCHASE ORDER UPDATE
  // ===========================================================================
  describe('PATCH /api/orders/stores/:storeId/purchase-orders/:id', () => {
    it('should update draft purchase order', async () => {
      if (!testPurchaseOrderId) {
        console.log('Skipping - no PO ID');
        return;
      }

      const response = await request(API_GATEWAY_URL)
        .patch(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${testPurchaseOrderId}`)
        .set(getTestAuthHeaders(authToken))
        .send({
          notes: 'Updated notes'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notes).toBe('Updated notes');
    });

    it('should add items to draft order', async () => {
      if (!testPurchaseOrderId) {
        console.log('Skipping - no PO ID');
        return;
      }

      const response = await request(API_GATEWAY_URL)
        .patch(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${testPurchaseOrderId}`)
        .set(getTestAuthHeaders(authToken))
        .send({
          items: [
            {
              productId: TEST_IDS.productId1,
              supplierProductId: TEST_IDS.supplierProductId1,
              quantity: 15,
              unitPrice: 80.00
            },
            {
              productId: TEST_IDS.productId2,
              supplierProductId: TEST_IDS.supplierProductId2,
              quantity: 10,
              unitPrice: 40.00
            }
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(2);
    });
  });

  // ===========================================================================
  // PURCHASE ORDER SUBMISSION
  // ===========================================================================
  describe('POST /api/orders/stores/:storeId/purchase-orders/:id/submit', () => {
    it('should submit draft purchase order', async () => {
      if (!testPurchaseOrderId) {
        console.log('Skipping - no PO ID');
        return;
      }

      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${testPurchaseOrderId}/submit`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('submitted');
      expect(response.body.data.submittedAt).toBeDefined();
    });

    it('should not allow update after submission', async () => {
      if (!testPurchaseOrderId) {
        console.log('Skipping - no PO ID');
        return;
      }

      const response = await request(API_GATEWAY_URL)
        .patch(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${testPurchaseOrderId}`)
        .set(getTestAuthHeaders(authToken))
        .send({
          notes: 'Should fail'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // PURCHASE ORDER CANCELLATION
  // ===========================================================================
  describe('POST /api/orders/stores/:storeId/purchase-orders/:id/cancel', () => {
    let cancelTestPOId: string;

    beforeAll(async () => {
      // Create a new PO for cancellation test
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', generateIdempotencyKey())
        .send({
          supplierId: TEST_IDS.supplierId,
          items: [
            {
              productId: TEST_IDS.productId1,
              supplierProductId: TEST_IDS.supplierProductId1,
              quantity: 10,
              unitPrice: 80.00
            }
          ]
        });

      cancelTestPOId = response.body.data.id;
    });

    it('should cancel draft purchase order', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${cancelTestPOId}/cancel`)
        .set(getTestAuthHeaders(authToken))
        .send({
          reason: 'Test cancellation'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.cancelledAt).toBeDefined();
    });

    it('should not allow cancellation of already cancelled order', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${cancelTestPOId}/cancel`)
        .set(getTestAuthHeaders(authToken))
        .send({
          reason: 'Should fail'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
