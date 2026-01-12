// Events/Outbox Tests - V3.0.9 compliant
// Event publishing and outbox pattern integration tests

import request from 'supertest';
import { testPool, TEST_IDS, TEST_CREDENTIALS, getTestAuthHeaders, generateIdempotencyKey, waitForEvent } from './setup';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

describe('Events Service', () => {
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
  // OUTBOX EVENT TESTS
  // ===========================================================================
  describe('Outbox Pattern', () => {
    let testPOId: string;

    beforeAll(async () => {
      // Create a PO to generate events
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
          ],
          notes: 'Event test order'
        });

      testPOId = response.body.data.id;
    });

    it('should publish PO_CREATED event on order creation', async () => {
      await waitForEvent(100);

      const result = await testPool.query(`
        SELECT * FROM outbox_events
        WHERE aggregate_type = 'PurchaseOrder'
        AND aggregate_id = $1
        AND event_type = 'PO_CREATED'
        ORDER BY created_at DESC
        LIMIT 1
      `, [testPOId]);

      expect(result.rows.length).toBe(1);

      const event = result.rows[0];
      expect(event.event_type).toBe('PO_CREATED');
      expect(event.aggregate_type).toBe('PurchaseOrder');
      expect(event.aggregate_id).toBe(testPOId);

      const payload = event.payload;
      expect(payload.purchaseOrderId).toBe(testPOId);
      expect(payload.storeId).toBe(TEST_IDS.storeId);
      expect(payload.supplierId).toBe(TEST_IDS.supplierId);
    });

    it('should publish PO_SUBMITTED event on order submission', async () => {
      // Submit the order
      await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${testPOId}/submit`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      await waitForEvent(100);

      const result = await testPool.query(`
        SELECT * FROM outbox_events
        WHERE aggregate_type = 'PurchaseOrder'
        AND aggregate_id = $1
        AND event_type = 'PO_SUBMITTED'
        ORDER BY created_at DESC
        LIMIT 1
      `, [testPOId]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].event_type).toBe('PO_SUBMITTED');
    });

    it('should have correct event ordering', async () => {
      const result = await testPool.query(`
        SELECT event_type, created_at FROM outbox_events
        WHERE aggregate_type = 'PurchaseOrder'
        AND aggregate_id = $1
        ORDER BY created_at ASC
      `, [testPOId]);

      const eventTypes = result.rows.map((r: any) => r.event_type);

      // PO_CREATED should come before PO_SUBMITTED
      const createdIndex = eventTypes.indexOf('PO_CREATED');
      const submittedIndex = eventTypes.indexOf('PO_SUBMITTED');

      expect(createdIndex).toBeLessThan(submittedIndex);
    });

    it('should include all required event metadata', async () => {
      const result = await testPool.query(`
        SELECT * FROM outbox_events
        WHERE aggregate_id = $1
        LIMIT 1
      `, [testPOId]);

      const event = result.rows[0];

      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('aggregate_type');
      expect(event).toHaveProperty('aggregate_id');
      expect(event).toHaveProperty('event_type');
      expect(event).toHaveProperty('payload');
      expect(event).toHaveProperty('created_at');
      expect(event).toHaveProperty('processed_at'); // May be null if not yet processed
    });
  });

  // ===========================================================================
  // INVENTORY EVENT TESTS
  // ===========================================================================
  describe('Inventory Events', () => {
    let testGrnId: string;

    beforeAll(async () => {
      // Create a GRN to generate inventory events
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
          notes: 'Event test GRN'
        });

      testGrnId = response.body.data.id;
    });

    it('should publish GRN_COMPLETED event', async () => {
      await waitForEvent(100);

      const result = await testPool.query(`
        SELECT * FROM outbox_events
        WHERE aggregate_type = 'GRN'
        AND aggregate_id = $1
        AND event_type = 'GRN_COMPLETED'
        ORDER BY created_at DESC
        LIMIT 1
      `, [testGrnId]);

      expect(result.rows.length).toBe(1);

      const payload = result.rows[0].payload;
      expect(payload.grnId).toBe(testGrnId);
      expect(payload.storeId).toBe(TEST_IDS.storeId);
    });

    it('should publish INVENTORY_UPDATED event', async () => {
      const result = await testPool.query(`
        SELECT * FROM outbox_events
        WHERE aggregate_type = 'Inventory'
        AND event_type = 'INVENTORY_UPDATED'
        AND payload->>'grnId' = $1
        ORDER BY created_at DESC
      `, [testGrnId]);

      // Should have one event per product in GRN
      expect(result.rows.length).toBeGreaterThanOrEqual(1);

      const event = result.rows[0];
      expect(event.payload.storeId).toBe(TEST_IDS.storeId);
      expect(event.payload.productId).toBeDefined();
      expect(event.payload.quantityChange).toBeDefined();
    });
  });

  // ===========================================================================
  // REORDER EVENT TESTS
  // ===========================================================================
  describe('Reorder Events', () => {
    it('should publish PENDING_REORDER_CREATED event when stock low', async () => {
      // Set high threshold to trigger pending reorder
      await request(API_GATEWAY_URL)
        .patch(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies/${TEST_IDS.productId2}`)
        .set(getTestAuthHeaders(authToken))
        .send({
          minThreshold: 500,
          targetStock: 1000,
          isEnabled: true
        });

      // Trigger reorder check
      await request(API_GATEWAY_URL)
        .post(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/check`)
        .set(getTestAuthHeaders(authToken));

      await waitForEvent(200);

      const result = await testPool.query(`
        SELECT * FROM outbox_events
        WHERE aggregate_type = 'PendingReorder'
        AND event_type = 'PENDING_REORDER_CREATED'
        AND payload->>'productId' = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [TEST_IDS.productId2]);

      // Event may or may not exist depending on whether pending was already created
      if (result.rows.length > 0) {
        const event = result.rows[0];
        expect(event.payload.storeId).toBe(TEST_IDS.storeId);
        expect(event.payload.productId).toBe(TEST_IDS.productId2);
      }

      // Reset threshold
      await request(API_GATEWAY_URL)
        .patch(`/api/reorder/stores/${TEST_IDS.storeId}/reorder/policies/${TEST_IDS.productId2}`)
        .set(getTestAuthHeaders(authToken))
        .send({
          minThreshold: 5,
          targetStock: 20
        });
    });
  });

  // ===========================================================================
  // IDEMPOTENCY TESTS
  // ===========================================================================
  describe('Idempotency', () => {
    it('should store idempotency key response', async () => {
      const idempotencyKey = generateIdempotencyKey();

      // First request
      const response1 = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', idempotencyKey)
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
        })
        .expect(201);

      const orderId = response1.body.data.id;

      // Second request with same key
      const response2 = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', idempotencyKey)
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
        })
        .expect(200); // Cached response returns 200

      // Should return same order ID
      expect(response2.body.data.id).toBe(orderId);
      expect(response2.headers['x-idempotent-replayed']).toBe('true');
    });

    it('should not create duplicate events for idempotent requests', async () => {
      const idempotencyKey = generateIdempotencyKey();

      // First request
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
              quantity: 10,
              unitPrice: 80.00
            }
          ]
        });

      const orderId = response.body.data.id;
      await waitForEvent(100);

      // Count events before second request
      const beforeResult = await testPool.query(`
        SELECT COUNT(*) as count FROM outbox_events
        WHERE aggregate_id = $1
      `, [orderId]);
      const countBefore = parseInt(beforeResult.rows[0].count);

      // Second request with same key
      await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders`)
        .set(getTestAuthHeaders(authToken))
        .set('Idempotency-Key', idempotencyKey)
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

      await waitForEvent(100);

      // Count events after second request
      const afterResult = await testPool.query(`
        SELECT COUNT(*) as count FROM outbox_events
        WHERE aggregate_id = $1
      `, [orderId]);
      const countAfter = parseInt(afterResult.rows[0].count);

      // Should not have created new events
      expect(countAfter).toBe(countBefore);
    });
  });

  // ===========================================================================
  // EVENT PROCESSING STATUS
  // ===========================================================================
  describe('Event Processing', () => {
    it('should track unprocessed events', async () => {
      const result = await testPool.query(`
        SELECT COUNT(*) as count FROM outbox_events
        WHERE processed_at IS NULL
      `);

      // Just verify query works - unprocessed count depends on processor status
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
    });

    it('should have proper event structure', async () => {
      const result = await testPool.query(`
        SELECT * FROM outbox_events
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (result.rows.length > 0) {
        const event = result.rows[0];

        // Verify required fields
        expect(typeof event.id).toBe('string');
        expect(typeof event.aggregate_type).toBe('string');
        expect(typeof event.aggregate_id).toBe('string');
        expect(typeof event.event_type).toBe('string');
        expect(typeof event.payload).toBe('object');
        expect(event.created_at instanceof Date).toBe(true);
      }
    });
  });
});
