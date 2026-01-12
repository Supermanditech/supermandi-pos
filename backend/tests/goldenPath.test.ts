// Golden Path Integration Test - V3.0.9 compliant
// PRIMARY: End-to-end purchase cycle validation
// This test MUST pass before any UI work proceeds

import request from 'supertest';
import { testPool, TEST_IDS, TEST_CREDENTIALS, generateIdempotencyKey, waitForEvent, getTestAuthHeaders } from './setup';

// =============================================================================
// TEST CONFIGURATION
// =============================================================================

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

describe('Golden Path: Complete Purchase Cycle', () => {
  let authToken: string;
  let purchaseOrderId: string;
  let grnId: string;
  const idempotencyKey = generateIdempotencyKey();

  // ===========================================================================
  // STEP 1: Staff Login
  // ===========================================================================
  describe('Step 1: Staff Login', () => {
    it('should authenticate staff and receive JWT token', async () => {
      const response = await request(API_GATEWAY_URL)
        .post('/api/auth/login')
        .send({
          phone: TEST_CREDENTIALS.staffPhone,
          pin: TEST_CREDENTIALS.staffPin,
          deviceFingerprint: TEST_CREDENTIALS.deviceFingerprint
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.id).toBe(TEST_IDS.staffUserId);
      expect(response.body.data.store).toBeDefined();
      expect(response.body.data.store.id).toBe(TEST_IDS.storeId);

      authToken = response.body.data.token;
    });

    it('should reject invalid credentials', async () => {
      const response = await request(API_GATEWAY_URL)
        .post('/api/auth/login')
        .send({
          phone: TEST_CREDENTIALS.staffPhone,
          pin: '0000', // Wrong PIN
          deviceFingerprint: TEST_CREDENTIALS.deviceFingerprint
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  // ===========================================================================
  // STEP 2: Browse Supplier Catalog
  // ===========================================================================
  describe('Step 2: Browse Supplier Catalog', () => {
    it('should list available suppliers', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      const testSupplier = response.body.data.find((s: any) => s.id === TEST_IDS.supplierId);
      expect(testSupplier).toBeDefined();
      expect(testSupplier.name).toBe('Test Supplier');
    });

    it('should get supplier catalog with products', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers/${TEST_IDS.supplierId}/catalog`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      const product = response.body.data[0];
      expect(product.productId).toBeDefined();
      expect(product.productName).toBeDefined();
      expect(product.unitPrice).toBeDefined();
      expect(product.moq).toBeDefined();
    });

    it('should search products in catalog', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/supplier/stores/${TEST_IDS.storeId}/suppliers/${TEST_IDS.supplierId}/catalog`)
        .query({ search: 'Test Product' })
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // STEP 3: Create Draft Purchase Order
  // ===========================================================================
  describe('Step 3: Create Draft Purchase Order', () => {
    it('should create draft purchase order with items', async () => {
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
              quantity: 20,
              unitPrice: 80.00
            },
            {
              productId: TEST_IDS.productId2,
              supplierProductId: TEST_IDS.supplierProductId2,
              quantity: 10,
              unitPrice: 40.00
            }
          ],
          notes: 'Golden Path test order'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.supplierId).toBe(TEST_IDS.supplierId);
      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.totalAmount).toBe(2000); // (20*80) + (10*40)

      purchaseOrderId = response.body.data.id;
    });

    it('should reject order below minimum order value', async () => {
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
              quantity: 5,  // Below MOQ of 10
              unitPrice: 80.00
            }
          ]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toMatch(/MOQ|VALIDATION/i);
    });

    it('should get draft purchase order', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${purchaseOrderId}`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(purchaseOrderId);
      expect(response.body.data.status).toBe('draft');
    });
  });

  // ===========================================================================
  // STEP 4: Submit Purchase Order
  // ===========================================================================
  describe('Step 4: Submit Purchase Order', () => {
    it('should submit draft purchase order', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${purchaseOrderId}/submit`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('submitted');
      expect(response.body.data.submittedAt).toBeDefined();
    });

    it('should not allow resubmission of submitted order', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${purchaseOrderId}/submit`)
        .set(getTestAuthHeaders(authToken))
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // STEP 5: Verify Event Published to Outbox
  // ===========================================================================
  describe('Step 5: Verify Event Published', () => {
    it('should have PO_SUBMITTED event in outbox', async () => {
      await waitForEvent(200); // Wait for async event processing

      const result = await testPool.query(`
        SELECT * FROM outbox_events
        WHERE aggregate_type = 'PurchaseOrder'
        AND aggregate_id = $1
        AND event_type = 'PO_SUBMITTED'
        ORDER BY created_at DESC
        LIMIT 1
      `, [purchaseOrderId]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].event_type).toBe('PO_SUBMITTED');

      const payload = result.rows[0].payload;
      expect(payload.purchaseOrderId).toBe(purchaseOrderId);
      expect(payload.storeId).toBe(TEST_IDS.storeId);
      expect(payload.supplierId).toBe(TEST_IDS.supplierId);
    });
  });

  // ===========================================================================
  // STEP 6: Supplier Confirm Order
  // ===========================================================================
  describe('Step 6: Supplier Confirm Order', () => {
    it('should confirm purchase order (supplier action)', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${purchaseOrderId}/confirm`)
        .set(getTestAuthHeaders(authToken))
        .send({
          expectedDeliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days from now
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('confirmed');
      expect(response.body.data.confirmedAt).toBeDefined();
    });

    it('should have PO_CONFIRMED event in outbox', async () => {
      await waitForEvent(200);

      const result = await testPool.query(`
        SELECT * FROM outbox_events
        WHERE aggregate_type = 'PurchaseOrder'
        AND aggregate_id = $1
        AND event_type = 'PO_CONFIRMED'
        ORDER BY created_at DESC
        LIMIT 1
      `, [purchaseOrderId]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].event_type).toBe('PO_CONFIRMED');
    });
  });

  // ===========================================================================
  // STEP 7: GRN Receive Goods
  // ===========================================================================
  describe('Step 7: GRN Receive Goods', () => {
    it('should create GRN to receive goods', async () => {
      const response = await request(API_GATEWAY_URL)
        .post(`/api/inventory/stores/${TEST_IDS.storeId}/grns`)
        .set(getTestAuthHeaders(authToken))
        .send({
          purchaseOrderId: purchaseOrderId,
          items: [
            {
              productId: TEST_IDS.productId1,
              quantityReceived: 20,
              quantityOrdered: 20
            },
            {
              productId: TEST_IDS.productId2,
              quantityReceived: 10,
              quantityOrdered: 10
            }
          ],
          notes: 'Full delivery received'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.purchaseOrderId).toBe(purchaseOrderId);
      expect(response.body.data.status).toBe('completed');

      grnId = response.body.data.id;
    });

    it('should have GRN_COMPLETED event in outbox', async () => {
      await waitForEvent(200);

      const result = await testPool.query(`
        SELECT * FROM outbox_events
        WHERE aggregate_type = 'GRN'
        AND aggregate_id = $1
        AND event_type = 'GRN_COMPLETED'
        ORDER BY created_at DESC
        LIMIT 1
      `, [grnId]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].event_type).toBe('GRN_COMPLETED');
    });

    it('should update purchase order status to received', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${purchaseOrderId}`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.status).toBe('received');
    });
  });

  // ===========================================================================
  // STEP 8: Verify Inventory Ledger Updated
  // ===========================================================================
  describe('Step 8: Verify Inventory Ledger', () => {
    it('should have inventory receipt ledger entries', async () => {
      const result = await testPool.query(`
        SELECT * FROM inventory_ledger
        WHERE store_id = $1
        AND reference_type = 'grn'
        AND reference_id = $2
        ORDER BY created_at DESC
      `, [TEST_IDS.storeId, grnId]);

      expect(result.rows.length).toBe(2); // 2 products

      const product1Entry = result.rows.find((r: any) => r.product_id === TEST_IDS.productId1);
      const product2Entry = result.rows.find((r: any) => r.product_id === TEST_IDS.productId2);

      expect(product1Entry).toBeDefined();
      expect(product1Entry.quantity_change).toBe(20);
      expect(product1Entry.transaction_type).toBe('receipt');

      expect(product2Entry).toBeDefined();
      expect(product2Entry.quantity_change).toBe(10);
      expect(product2Entry.transaction_type).toBe('receipt');
    });

    it('should have updated inventory quantities', async () => {
      const result = await testPool.query(`
        SELECT * FROM inventory
        WHERE store_id = $1
        AND product_id IN ($2, $3)
      `, [TEST_IDS.storeId, TEST_IDS.productId1, TEST_IDS.productId2]);

      const product1Inv = result.rows.find((r: any) => r.product_id === TEST_IDS.productId1);
      const product2Inv = result.rows.find((r: any) => r.product_id === TEST_IDS.productId2);

      // Initial: 100, Received: 20 = 120
      expect(product1Inv.quantity).toBe(120);

      // Initial: 50, Received: 10 = 60
      expect(product2Inv.quantity).toBe(60);
    });
  });

  // ===========================================================================
  // STEP 9: Verify Idempotency
  // ===========================================================================
  describe('Step 9: Verify Idempotency', () => {
    it('should return cached response for duplicate request', async () => {
      // Attempt to create same order with same idempotency key
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
              quantity: 20,
              unitPrice: 80.00
            }
          ]
        })
        .expect(200); // Returns cached response, not 201

      expect(response.body.success).toBe(true);
      // Should return the same order ID from cache
      expect(response.body.data.id).toBe(purchaseOrderId);
      expect(response.headers['x-idempotent-replayed']).toBe('true');
    });
  });

  // ===========================================================================
  // STEP 10: Complete Purchase Cycle Verified
  // ===========================================================================
  describe('Step 10: Complete Cycle Verification', () => {
    it('should verify complete purchase cycle state', async () => {
      // Verify final PO state
      const poResponse = await request(API_GATEWAY_URL)
        .get(`/api/orders/stores/${TEST_IDS.storeId}/purchase-orders/${purchaseOrderId}`)
        .set(getTestAuthHeaders(authToken))
        .expect(200);

      expect(poResponse.body.data.status).toBe('received');
      expect(poResponse.body.data.submittedAt).toBeDefined();
      expect(poResponse.body.data.confirmedAt).toBeDefined();

      // Verify all events were published
      const eventsResult = await testPool.query(`
        SELECT event_type FROM outbox_events
        WHERE aggregate_id = $1
        ORDER BY created_at ASC
      `, [purchaseOrderId]);

      const eventTypes = eventsResult.rows.map((r: any) => r.event_type);
      expect(eventTypes).toContain('PO_CREATED');
      expect(eventTypes).toContain('PO_SUBMITTED');
      expect(eventTypes).toContain('PO_CONFIRMED');

      // Log success
      console.log('\n✅ GOLDEN PATH TEST PASSED');
      console.log('   Purchase Order ID:', purchaseOrderId);
      console.log('   GRN ID:', grnId);
      console.log('   Events Published:', eventTypes.join(', '));
    });
  });
});
