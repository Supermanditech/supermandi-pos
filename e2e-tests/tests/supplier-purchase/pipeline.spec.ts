/**
 * SUP-POS-E01: Full Supplier → POS Purchase Pipeline E2E Test
 * @supplier_purchase
 *
 * Tests the end-to-end flow:
 * 1. Supplier creates product → Admin approves → Appears in buy catalog
 * 2. POS creates purchase order → Supplier sees it → Confirms → Ships → POS receives
 * 3. Store isolation: Store A's catalog ≠ Store B's catalog
 *
 * Run: npx playwright test --grep "@supplier_purchase" --project=chromium
 */

import { test, expect } from "@playwright/test";
import {
  API_BASE,
  setupTestStore,
  setupTestSupplier,
  adminVerifySupplier,
  adminLinkSupplierToStore,
  adminHeaders,
  posHeaders,
  supplierHeaders,
  retailerHeaders,
  uniqueBarcode,
  TestStoreContext,
  TestSupplierContext,
} from "./helpers";

// API-only tests: run sequentially on chromium only
test.use({ browserName: 'chromium' });

test.describe.serial("@supplier_purchase Supplier → POS Purchase Pipeline", () => {
  let storeA: TestStoreContext;
  let storeB: TestStoreContext;
  let supplier: TestSupplierContext;
  let testBarcode: string;
  let supplierProductId: string;
  let orderId: string;

  // =========================================================================
  // SETUP
  // =========================================================================

  test("0. Setup: register stores, supplier, verify, and link", async ({ request }) => {
    // Register two stores and one supplier in parallel-ish
    storeA = await setupTestStore(request, "storeA");
    storeB = await setupTestStore(request, "storeB");
    supplier = await setupTestSupplier(request, "sup1");
    testBarcode = uniqueBarcode();

    // Admin verifies supplier
    await adminVerifySupplier(request, supplier.supplierId);

    // Link supplier to Store A only (NOT Store B — for isolation test)
    await adminLinkSupplierToStore(request, storeA.storeId, supplier.supplierId);
  });

  // =========================================================================
  // TEST 1: Product creation + approval pipeline
  // =========================================================================

  test("1a. Supplier creates a product", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/supplier/products`, {
      headers: supplierHeaders(supplier.token),
      data: {
        name: `E2E Test Product ${testBarcode}`,
        category: "Beverages",
        brand: "TestBrand",
        barcode: testBarcode,
        purchasePrice: 5000, // ₹50.00 in paise
        mrp: 6500,
        moq: 1,
        unit: "PCS",
        stockQuantity: 100,
      },
    });

    expect(res.status(), "Supplier product creation must succeed").toBe(201);
    const body = await res.json();
    supplierProductId = body.data?.id || body.id;
    expect(supplierProductId, "Must return product ID").toBeTruthy();
  });

  test("1b. Product appears in admin pending list", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/admin/products/pending`, {
      headers: adminHeaders(),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const products = body.data || body;
    const found = products.find(
      (p: any) => p.id === supplierProductId || p.barcode === testBarcode
    );
    expect(found, "Supplier product must appear in admin pending queue").toBeTruthy();
  });

  test("1c. Admin edits margin and approves product", async ({ request }) => {
    // Edit margin (fixed paise margin)
    const editRes = await request.put(
      `${API_BASE}/api/v1/admin/products/${supplierProductId}/edit`,
      {
        headers: adminHeaders(),
        data: {
          supermandiMarginMinor: 500, // ₹5.00 fixed margin
        },
      }
    );
    expect(editRes.status(), "Admin product edit must succeed").toBe(200);

    // Approve
    const approveRes = await request.post(
      `${API_BASE}/api/v1/admin/products/${supplierProductId}/approve`,
      { headers: adminHeaders() }
    );
    expect(approveRes.status(), "Admin product approval must succeed").toBe(200);
  });

  test("1d. Approved product appears in Store A buy catalog with margin", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/api/v1/catalog/stores/${storeA.storeId}/buy-catalog?q=${testBarcode}`,
      { headers: posHeaders(storeA.deviceToken) }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length, "Buy catalog must return the product").toBeGreaterThan(0);

    const product = body.data[0];
    expect(product.bestPrice, "Price must include margin (5000 + 500 = 5500)").toBe(5500);
    expect(product.suppliers.length, "Must have at least 1 supplier").toBeGreaterThan(0);
  });

  // =========================================================================
  // TEST 2: POS purchase order creation
  // =========================================================================

  test("2a. POS creates a purchase order", async ({ request }) => {
    // First, get the supplier product ID from buy catalog
    const catalogRes = await request.get(
      `${API_BASE}/api/v1/catalog/stores/${storeA.storeId}/buy-catalog?q=${testBarcode}`,
      { headers: posHeaders(storeA.deviceToken) }
    );
    const catalogBody = await catalogRes.json();
    const supplierOffer = catalogBody.data[0]?.suppliers[0];
    expect(supplierOffer, "Must have a supplier offer").toBeTruthy();

    const res = await request.post(
      `${API_BASE}/api/v1/orders/stores/${storeA.storeId}/orders`,
      {
        headers: posHeaders(storeA.deviceToken),
        data: {
          supplierId: supplierOffer.supplierId,
          orderType: "manual",
          items: [
            {
              supplierProductId: supplierOffer.supplierProductId,
              quantity: 5,
              unitPrice: supplierOffer.purchasePrice,
            },
          ],
          storeNotes: "E2E test order",
        },
      }
    );

    expect(res.status(), "POS order creation must succeed").toBe(201);
    const body = await res.json();
    orderId = body.data?.id || body.orderId || body.data?.orderId;
    expect(orderId, "Must return order ID").toBeTruthy();
  });

  test("2b. Order appears in store's order list", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/api/v1/orders/stores/${storeA.storeId}/orders`,
      { headers: posHeaders(storeA.deviceToken) }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    const orders = body.data || [];
    const found = orders.find((o: any) => o.id === orderId);
    expect(found, "Order must appear in store order list").toBeTruthy();
    expect(found.status).toBe("pending");
  });

  test("2c. Order visible to supplier", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/supplier/orders`, {
      headers: supplierHeaders(supplier.token),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const orders = body.data || [];
    const found = orders.find((o: any) => o.id === orderId);
    expect(found, "Order must be visible to supplier").toBeTruthy();
    expect(found.items.length, "Order must have items").toBeGreaterThan(0);
  });

  // =========================================================================
  // TEST 3: Supplier order lifecycle
  // =========================================================================

  test("3a. Supplier confirms order", async ({ request }) => {
    const res = await request.patch(
      `${API_BASE}/api/v1/supplier/orders/${orderId}/status`,
      {
        headers: supplierHeaders(supplier.token),
        data: { status: "confirmed" },
      }
    );

    expect(res.status(), "Status update to confirmed must succeed").toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("confirmed");
  });

  test("3b. Supplier ships order with tracking", async ({ request }) => {
    const res = await request.patch(
      `${API_BASE}/api/v1/supplier/orders/${orderId}/shipment`,
      {
        headers: supplierHeaders(supplier.token),
        data: {
          trackingNumber: `E2E-TRK-${Date.now()}`,
          carrier: "Delhivery",
          shipmentDate: new Date().toISOString(),
          expectedDeliveryDate: new Date(
            Date.now() + 3 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
      }
    );

    expect(res.status(), "Shipment update must succeed").toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("shipped");
    expect(body.data.trackingNumber).toBeTruthy();
  });

  test("3c. POS receives goods", async ({ request }) => {
    // First get order detail to find item IDs
    const detailRes = await request.get(
      `${API_BASE}/api/v1/orders/stores/${storeA.storeId}/orders/${orderId}`,
      { headers: posHeaders(storeA.deviceToken) }
    );
    expect(detailRes.status()).toBe(200);
    const detail = await detailRes.json();
    const items = detail.data?.items || detail.items || [];
    expect(items.length).toBeGreaterThan(0);

    const res = await request.post(
      `${API_BASE}/api/v1/orders/stores/${storeA.storeId}/orders/${orderId}/receive`,
      {
        headers: posHeaders(storeA.deviceToken),
        data: {
          items: items.map((item: any) => ({
            orderItemId: item.id,
            receivedQuantity: item.orderedQuantity || item.ordered_quantity || 5,
          })),
          notes: "E2E receive test",
        },
      }
    );

    expect(res.status(), "GRN receive must succeed").toBeLessThan(300);
  });

  test("3d. Order events (timeline) are recorded", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/api/v1/supplier/orders/${orderId}/events`,
      { headers: supplierHeaders(supplier.token) }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    const events = body.data || [];
    expect(events.length, "Must have status change events").toBeGreaterThanOrEqual(2);

    // Should have at least: order_created, status_changed_to_confirmed, shipment_added
    const eventTypes = events.map((e: any) => e.eventType);
    expect(
      eventTypes.some((t: string) => t.includes("confirmed")),
      "Must have confirmed event"
    ).toBe(true);
  });

  // =========================================================================
  // TEST 4: Store isolation
  // =========================================================================

  test("4. Store B cannot see Store A's supplier products", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/api/v1/catalog/stores/${storeB.storeId}/buy-catalog?q=${testBarcode}`,
      { headers: posHeaders(storeB.deviceToken) }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Store B should NOT see products from supplier linked only to Store A
    expect(
      body.data.length,
      "Store B must NOT see Store A's supplier products"
    ).toBe(0);
  });
});
