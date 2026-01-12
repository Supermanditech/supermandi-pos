// Reorder Service Tests - V3.0.9 compliant
// Automatic reordering system integration tests

import request from 'supertest';
import { testPool, TEST_IDS, TEST_CREDENTIALS, getTestAuthHeaders, generateIdempotencyKey } from './setup';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

describe('Reorder Service', () => {
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
  // REORDER SETTINGS TESTS
  // ===========================================================================
  describe('GET /api/reorder/stores/:storeId/reorder/settings', () => {
    it('should get reorder settings', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/settings`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('storeId');
      expect(response.body.data).toHaveProperty('reorderEnabled');
      expect(response.body.data).toHaveProperty('requireApproval');
      expect(response.body.data).toHaveProperty('autoApproveThreshold');
      expect(response.body.data).toHaveProperty('defaultLeadDays');
    });
  });

  describe('PATCH /api/reorder/stores/:storeId/reorder/settings', () => {
    it('should update reorder settings', async () => {
      const response = await request(API_GATEWAY_URL)
        .patch(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/settings`)
        .set(getTestAuthHeaders(authToken))
        .send({
          reorderEnabled: true,
          requireApproval: true,
          autoApproveThreshold: 5000,
          defaultLeadDays: 3
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reorderEnabled).toBe(true);
      expect(response.body.data.autoApproveThreshold).toBe(5000);
      expect(response.body.data.defaultLeadDays).toBe(3);
    });

    it('should validate settings values', async () => {
      const response = await request(API_GATEWAY_URL)
        .patch(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/settings`)
        .set(getTestAuthHeaders(authToken))
        .send({
          defaultLeadDays: -1 // Invalid negative value
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // REORDER POLICIES TESTS
  // ===========================================================================
  describe('GET /api/reorder/stores/:storeId/reorder/policies', () => {
    it('should list reorder policies', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should search policies by product name', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies`)
        .query({ search: 'Test' })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should filter by enabled status', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies`)
        .query({ isEnabled: true })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.forEach((policy: any) => {
        expect(policy.isEnabled).toBe(true);
      });
    });
  });

  describe('PATCH /api/reorder/stores/:storeId/reorder/policies/:productId', () => {
    it('should update reorder policy', async () => {
      const response = await request(API_GATEWAY_URL)
        .patch(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies/${TEST_IDS.productId1}`)
        .set(getTestAuthHeaders(authToken))
        .send({
          minThreshold: 20,
          targetStock: 100,
          preferredSupplierId: TEST_IDS.supplierId,
          isEnabled: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.minThreshold).toBe(20);
      expect(response.body.data.targetStock).toBe(100);
      expect(response.body.data.isEnabled).toBe(true);
    });

    it('should validate threshold < target', async () => {
      const response = await request(API_GATEWAY_URL)
        .patch(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies/${TEST_IDS.productId1}`)
        .set(getTestAuthHeaders(authToken))
        .send({
          minThreshold: 100,
          targetStock: 50 // Target less than threshold - invalid
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/reorder/stores/:storeId/reorder/policies/bulk', () => {
    it('should bulk update policies', async () => {
      const response = await request(API_GATEWAY_URL)
        .patch(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies/bulk`)
        .set(getTestAuthHeaders(authToken))
        .send({
          policies: [
            {
              productId: TEST_IDS.productId1,
              minThreshold: 15,
              targetStock: 80
            },
            {
              productId: TEST_IDS.productId2,
              minThreshold: 10,
              targetStock: 50
            }
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.updatedCount).toBe(2);
    });
  });

  // ===========================================================================
  // PENDING REORDERS TESTS
  // ===========================================================================
  describe('Pending Reorders', () => {
    let pendingReorderId: string;

    // Create a pending reorder for testing by reducing stock below threshold
    beforeAll(async () => {
      // First, set up a policy with low threshold
      await request(API_GATEWAY_URL)
        .patch(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies/${TEST_IDS.productId1}`)
        .set(getTestAuthHeaders(authToken))
        .send({
          minThreshold: 200, // High threshold to trigger reorder
          targetStock: 300,
          isEnabled: true
        });

      // Trigger reorder check (this would normally be done by a scheduled job)
      await request(API_GATEWAY_URL)
        .post(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/check`)
        .set(getTestAuthHeaders(authToken));
    });

    describe('GET /api/reorder/stores/:storeId/reorder/pending', () => {
      it('should list pending reorders', async () => {
        const response = await request(API_GATEWAY_URL)
          .get(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/pending`)
          .set(getTestAuthHeaders(authToken))
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);

        if (response.body.data.length > 0) {
          pendingReorderId = response.body.data[0].id;

          const pending = response.body.data[0];
          expect(pending).toHaveProperty('productId');
          expect(pending).toHaveProperty('productName');
          expect(pending).toHaveProperty('currentStock');
          expect(pending).toHaveProperty('minThreshold');
          expect(pending).toHaveProperty('suggestedQuantity');
          expect(pending).toHaveProperty('status');
        }
      });

      it('should filter by status', async () => {
        const response = await request(API_GATEWAY_URL)
          .get(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/pending`)
          .query({ status: 'pending' })
          .set(getTestAuthHeaders(authToken))
          .expect(200);

        expect(response.body.success).toBe(true);
        response.body.data.forEach((item: any) => {
          expect(item.status).toBe('pending');
        });
      });
    });

    describe('POST /api/reorder/stores/:storeId/reorder/pending/approve', () => {
      it('should approve pending reorders', async () => {
        if (!pendingReorderId) {
          console.log('Skipping - no pending reorder');
          return;
        }

        const response = await request(API_GATEWAY_URL)
          .post(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/pending/approve`)
          .set(getTestAuthHeaders(authToken))
          .send({
            ids: [pendingReorderId]
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.approvedCount).toBeGreaterThanOrEqual(0);
        expect(response.body.data.draftPurchaseOrders).toBeInstanceOf(Array);
      });

      it('should reject empty approval list', async () => {
        const response = await request(API_GATEWAY_URL)
          .post(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/pending/approve`)
          .set(getTestAuthHeaders(authToken))
          .send({
            ids: []
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/reorder/stores/:storeId/reorder/pending/:id/dismiss', () => {
      let dismissTestId: string;

      beforeAll(async () => {
        // Get a fresh pending reorder for dismiss test
        const response = await request(API_GATEWAY_URL)
          .get(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/pending`)
          .query({ status: 'pending' })
          .set(getTestAuthHeaders(authToken));

        if (response.body.data.length > 0) {
          dismissTestId = response.body.data[0].id;
        }
      });

      it('should dismiss pending reorder with reason', async () => {
        if (!dismissTestId) {
          console.log('Skipping - no pending reorder to dismiss');
          return;
        }

        const response = await request(API_GATEWAY_URL)
          .post(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/pending/${dismissTestId}/dismiss`)
          .set(getTestAuthHeaders(authToken))
          .send({
            reason: 'Stock count was incorrect'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe('dismissed');
        expect(response.body.data.dismissedReason).toBe('Stock count was incorrect');
      });

      it('should require reason for dismissal', async () => {
        if (!dismissTestId) {
          console.log('Skipping - no ID');
          return;
        }

        const response = await request(API_GATEWAY_URL)
          .post(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/pending/${dismissTestId}/dismiss`)
          .set(getTestAuthHeaders(authToken))
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // REORDER CHECK TRIGGER
  // ===========================================================================
  describe('POST /api/reorder/stores/:storeId/reorder/check', () => {
    it('should trigger reorder check', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/check`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('productsChecked');
      expect(response.body.data).toHaveProperty('newPendingCount');
    });
  });

  // ===========================================================================
  // CLEANUP: Reset policy thresholds
  // ===========================================================================
  afterAll(async () => {
    // Reset thresholds to reasonable values
    await request(API_GATEWAY_URL)
      .patch(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies/${TEST_IDS.productId1}`)
      .set(getTestAuthHeaders(authToken))
      .send({
        minThreshold: 10,
        targetStock: 50
      });
  });
});
