/**
 * RET-POS-SYNC-011: Bulk-Paste Dedup E2E Test
 * @retailer-pos-sync
 *
 * Proves: Bulk-paste uses same dedup semantics as CSV import.
 * Re-pasting a product with an existing barcode updates instead of orphaning.
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

test.describe("@retailer-pos-sync Bulk-Paste Dedup", () => {
  let ctx: TestStoreContext;

  test("0. Setup: register store and enroll POS device", async ({ request }) => {
    ctx = await setupTestStore(request, "bpdedup");
  });

  test("1. Bulk-paste twice with same barcode updates instead of creating duplicate", async ({ request }) => {
    const barcode = uniqueBarcode();

    // First paste: create product with price 1000
    const paste1 = await request.post(`${API_BASE}/api/v1/retailer-admin/products/bulk-paste/commit`, {
      headers: retailerHeaders(ctx.storeId),
      data: {
        rows: [
          { name: "Dedup Test Product", barcode, sellPrice: 1000, purchasePrice: 800, unit: "PCS", stock: 50 },
        ],
      },
    });
    expect(paste1.status()).toBe(200);
    const body1 = await paste1.json();
    expect(body1.data.created).toBe(1);
    expect(body1.data.updated).toBe(0);

    // POS sees product at price 1000
    const lookup1 = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookup1.status()).toBe(200);
    const prod1 = (await lookup1.json()).data;
    const price1 = prod1?.sell_price ?? prod1?.sellPrice;
    expect(price1, "Initial price must be 1000").toBe(1000);

    // Second paste: same barcode, new price 2000
    const paste2 = await request.post(`${API_BASE}/api/v1/retailer-admin/products/bulk-paste/commit`, {
      headers: retailerHeaders(ctx.storeId),
      data: {
        rows: [
          { name: "Dedup Test Product Updated", barcode, sellPrice: 2000, purchasePrice: 1500, unit: "PCS", stock: 75 },
        ],
      },
    });
    expect(paste2.status()).toBe(200);
    const body2 = await paste2.json();
    expect(body2.data.created, "Second paste must NOT create new product").toBe(0);
    expect(body2.data.updated, "Second paste must UPDATE existing product").toBe(1);

    // POS sees updated price 2000
    const lookup2 = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookup2.status()).toBe(200);
    const prod2 = (await lookup2.json()).data;
    const price2 = prod2?.sell_price ?? prod2?.sellPrice;
    expect(price2, "Updated price must be 2000").toBe(2000);

    // Dashboard search returns exactly 1 product with this barcode (no orphan)
    const listRes = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${barcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    const products = (await listRes.json()).data;
    const matches = products.filter((p: any) => p.barcode === barcode);
    expect(matches.length, "Must be exactly 1 product, no orphan duplicate").toBe(1);
  });

  test("2. Mixed paste: new + existing products handled correctly", async ({ request }) => {
    const existingBarcode = uniqueBarcode();
    const newBarcode = uniqueBarcode();

    // Create one product first
    const paste1 = await request.post(`${API_BASE}/api/v1/retailer-admin/products/bulk-paste/commit`, {
      headers: retailerHeaders(ctx.storeId),
      data: {
        rows: [
          { name: "Existing Product", barcode: existingBarcode, sellPrice: 500, purchasePrice: 300, unit: "PCS", stock: 10 },
        ],
      },
    });
    expect(paste1.status()).toBe(200);

    // Paste batch with one existing + one new
    const paste2 = await request.post(`${API_BASE}/api/v1/retailer-admin/products/bulk-paste/commit`, {
      headers: retailerHeaders(ctx.storeId),
      data: {
        rows: [
          { name: "Existing Product v2", barcode: existingBarcode, sellPrice: 600, purchasePrice: 400, unit: "PCS", stock: 20 },
          { name: "Brand New Product", barcode: newBarcode, sellPrice: 900, purchasePrice: 700, unit: "PCS", stock: 30 },
        ],
      },
    });
    expect(paste2.status()).toBe(200);
    const body2 = await paste2.json();
    expect(body2.data.created, "New product created").toBe(1);
    expect(body2.data.updated, "Existing product updated").toBe(1);

    // Verify both are independently visible in POS
    const lookupExisting = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${existingBarcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookupExisting.status()).toBe(200);
    const existingProd = (await lookupExisting.json()).data;
    const existingPrice = existingProd?.sell_price ?? existingProd?.sellPrice;
    expect(existingPrice, "Existing product updated to 600").toBe(600);

    const lookupNew = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${newBarcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookupNew.status()).toBe(200);
  });
});
