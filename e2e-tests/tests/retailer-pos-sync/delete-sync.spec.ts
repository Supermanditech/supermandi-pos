/**
 * RET-POS-SYNC-007: Dashboard Soft-Delete → POS Behavior E2E Test
 * @retailer-pos-sync
 *
 * Proves: Soft-deleted products (is_active=false) are invisible to POS.
 * POS queries filter: WHERE sp.is_active = true AND p.is_active = true
 *
 * Run: npx playwright test --grep "@retailer-pos-sync"
 */

import { test, expect } from "@playwright/test";
import {
  API_BASE,
  setupTestStore,
  retailerHeaders,
  posHeaders,
  uniqueBarcode,
  TestStoreContext,
} from "./helpers";

test.describe("@retailer-pos-sync Delete Sync", () => {
  let ctx: TestStoreContext;

  test("0. Setup: register store and enroll POS device", async ({ request }) => {
    ctx = await setupTestStore(request, "delsync");
  });

  test("1. Dashboard soft-delete hides product from POS", async ({ request }) => {
    const barcode = uniqueBarcode();

    // Create product via Dashboard
    const createRes = await request.post(`${API_BASE}/api/v1/retailer-admin/products`, {
      headers: retailerHeaders(ctx.storeId),
      data: {
        mode: "PACKAGED",
        name: "Delete Test Product",
        barcode,
        sellPrice: 1000,
        purchasePrice: 800,
        unit: "PCS",
      },
    });
    expect(createRes.status()).toBe(201);

    // Get storeProductId
    const listRes = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${barcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    const products = (await listRes.json()).data;
    const storeProductId = products[0]?.id;
    expect(storeProductId, "Product must exist to delete").toBeTruthy();

    // POS can see it initially
    const lookupBefore = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookupBefore.status(), "POS must find product before delete").toBe(200);

    // Dashboard deletes it
    const deleteRes = await request.delete(
      `${API_BASE}/api/v1/retailer-admin/products/${storeProductId}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    expect(deleteRes.status()).toBe(200);

    // POS scan returns 404
    const lookupAfter = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookupAfter.status(), "POS must NOT find deleted product").toBe(404);
  });

  test("2. POS-created product can be deleted from Dashboard", async ({ request }) => {
    const barcode = uniqueBarcode();

    // POS creates product
    const createRes = await request.post(`${API_BASE}/api/v1/pos/store-products`, {
      headers: posHeaders(ctx.deviceToken),
      data: {
        barcode,
        name: "POS Product To Delete",
        sellPrice: 500,
        unit: "PCS",
      },
    });
    expect(createRes.status()).toBe(201);

    // Dashboard finds it
    const listRes = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${barcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    const products = (await listRes.json()).data;
    expect(products.length, "Dashboard must see POS product").toBeGreaterThan(0);
    const storeProductId = products[0].id;

    // Dashboard deletes it
    const deleteRes = await request.delete(
      `${API_BASE}/api/v1/retailer-admin/products/${storeProductId}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    expect(deleteRes.status()).toBe(200);

    // POS scan returns 404
    const lookupAfter = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookupAfter.status(), "POS must NOT find deleted product").toBe(404);

    // Dashboard list also no longer includes it
    const listAfter = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${barcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    const productsAfter = (await listAfter.json()).data;
    const stillFound = productsAfter.find((p: any) => p.barcode === barcode);
    expect(stillFound, "Dashboard must NOT show deleted product").toBeFalsy();
  });
});
