/**
 * RET-POS-SYNC-012: Stock PATCH LWW (Last-Write-Wins) E2E Test
 * @retailer-pos-sync
 *
 * Proves: Concurrent stock updates from POS and Dashboard are conflict-safe.
 * If a client sends a stale stockUpdatedAt, the server rejects with 409.
 *
 * Canonical rule: stock_balances.updated_at is the LWW clock.
 * If client provides stockUpdatedAt and server's updated_at > client's, reject.
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

test.describe("@retailer-pos-sync Stock LWW", () => {
  let ctx: TestStoreContext;

  test("0. Setup: register store and enroll POS device", async ({ request }) => {
    ctx = await setupTestStore(request, "stocklww");
  });

  test("1. POS stale stock update rejected with 409", async ({ request }) => {
    const barcode = uniqueBarcode();

    // Create product via Dashboard with initial stock 100
    const createRes = await request.post(`${API_BASE}/api/v1/retailer-admin/products`, {
      headers: retailerHeaders(ctx.storeId),
      data: {
        mode: "PACKAGED",
        name: "LWW Stock Test",
        barcode,
        sellPrice: 500,
        purchasePrice: 300,
        unit: "PCS",
        openingStockQty: 100,
      },
    });
    expect(createRes.status()).toBe(201);

    // POS reads product — gets initial stockUpdatedAt
    const lookup1 = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookup1.status()).toBe(200);

    // POS updates stock to 90 (no LWW timestamp — always succeeds for backward compat)
    const posUpdate1 = await request.patch(`${API_BASE}/api/v1/pos/store-products/stock`, {
      headers: posHeaders(ctx.deviceToken),
      data: { barcode, stock: 90 },
    });
    expect(posUpdate1.status()).toBe(200);
    const posUpdate1Body = await posUpdate1.json();
    const freshTimestamp = posUpdate1Body.data.stockUpdatedAt;
    expect(freshTimestamp, "Response must include stockUpdatedAt").toBeTruthy();

    // Dashboard updates stock to 80 (this succeeds, making POS's timestamp stale)
    const dashRes = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${barcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    const products = (await dashRes.json()).data;
    const storeProductId = products[0]?.id;
    expect(storeProductId).toBeTruthy();

    const dashUpdate = await request.patch(
      `${API_BASE}/api/v1/retailer-admin/products/${storeProductId}`,
      {
        headers: retailerHeaders(ctx.storeId),
        data: { openingStockQty: 80 },
      }
    );
    expect(dashUpdate.status()).toBe(200);

    // POS tries to update stock to 85 with STALE timestamp → should be rejected
    const staleUpdate = await request.patch(`${API_BASE}/api/v1/pos/store-products/stock`, {
      headers: posHeaders(ctx.deviceToken),
      data: { barcode, stock: 85, stockUpdatedAt: freshTimestamp },
    });
    expect(staleUpdate.status(), "Stale POS stock update must be rejected").toBe(409);
    const staleBody = await staleUpdate.json();
    expect(staleBody.error).toBe("stale_write");
  });

  test("2. POS stock update without stockUpdatedAt always succeeds (backward compat)", async ({ request }) => {
    const barcode = uniqueBarcode();

    // Create product
    const createRes = await request.post(`${API_BASE}/api/v1/retailer-admin/products`, {
      headers: retailerHeaders(ctx.storeId),
      data: {
        mode: "PACKAGED",
        name: "LWW Compat Test",
        barcode,
        sellPrice: 400,
        purchasePrice: 200,
        unit: "PCS",
        openingStockQty: 50,
      },
    });
    expect(createRes.status()).toBe(201);

    // POS update without stockUpdatedAt → always succeeds
    const update = await request.patch(`${API_BASE}/api/v1/pos/store-products/stock`, {
      headers: posHeaders(ctx.deviceToken),
      data: { barcode, stock: 45 },
    });
    expect(update.status()).toBe(200);
    const body = await update.json();
    expect(body.data.stock).toBe(45);
    expect(body.data.stockUpdatedAt, "Response must include stockUpdatedAt").toBeTruthy();
  });

  test("3. Dashboard stale stock update rejected with 409", async ({ request }) => {
    const barcode = uniqueBarcode();

    // Create product via Dashboard
    const createRes = await request.post(`${API_BASE}/api/v1/retailer-admin/products`, {
      headers: retailerHeaders(ctx.storeId),
      data: {
        mode: "PACKAGED",
        name: "Dashboard LWW Test",
        barcode,
        sellPrice: 600,
        purchasePrice: 400,
        unit: "PCS",
        openingStockQty: 200,
      },
    });
    expect(createRes.status()).toBe(201);

    // Capture a timestamp before any further updates (this will become stale)
    const staleTimestamp = new Date(Date.now() - 5000).toISOString(); // 5 seconds in the past

    // POS updates stock (makes any previous timestamp stale)
    const posUpdate = await request.patch(`${API_BASE}/api/v1/pos/store-products/stock`, {
      headers: posHeaders(ctx.deviceToken),
      data: { barcode, stock: 190 },
    });
    expect(posUpdate.status()).toBe(200);

    // Dashboard tries stale stock update → 409
    const dashRes = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${barcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    const products = (await dashRes.json()).data;
    const storeProductId = products[0]?.id;

    const staleUpdate = await request.patch(
      `${API_BASE}/api/v1/retailer-admin/products/${storeProductId}`,
      {
        headers: retailerHeaders(ctx.storeId),
        data: { openingStockQty: 180, stockUpdatedAt: staleTimestamp },
      }
    );
    expect(staleUpdate.status(), "Stale dashboard stock update must be rejected").toBe(409);
    const staleBody = await staleUpdate.json();
    expect(staleBody.error).toBe("stale_write");
  });
});
