/**
 * RET-POS-SYNC-005: POS First-Scan → Retailer Dashboard Visibility E2E Test
 * @retailer-pos-sync
 *
 * Proves: Product created via POS endpoint appears in Retailer Dashboard list.
 * Sync mechanism: Shared PostgreSQL tables (no cache, immediate consistency).
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

test.describe("@retailer-pos-sync POS → Dashboard Sync", () => {
  let ctx: TestStoreContext;
  let testBarcode: string;
  const testProductName = "POS Scan Test Product";

  test("0. Setup: register store and enroll POS device", async ({ request }) => {
    ctx = await setupTestStore(request, "pos2dash");
    testBarcode = uniqueBarcode();
  });

  test("1. POS first-scan digitised product appears in Dashboard product list", async ({ request }) => {
    // Create product via POS endpoint (simulates first-time barcode scan digitisation)
    const createRes = await request.post(`${API_BASE}/api/v1/pos/store-products`, {
      headers: posHeaders(ctx.deviceToken),
      data: {
        barcode: testBarcode,
        name: testProductName,
        sellPrice: 2500,
        purchasePrice: 2000,
        initialStockQty: 10,
        unit: "PCS",
      },
    });
    expect(createRes.status(), "POS product creation must succeed").toBe(201);
    const createBody = await createRes.json();
    expect(createBody.storeProduct, "Response must contain storeProduct").toBeTruthy();

    // Fetch retailer dashboard product list
    const listRes = await request.get(`${API_BASE}/api/v1/retailer-admin/products`, {
      headers: retailerHeaders(ctx.storeId),
    });
    expect(listRes.status()).toBe(200);
    const products = (await listRes.json()).data;

    // POS-created product must be in dashboard list
    const found = products.find(
      (p: any) => p.barcode === testBarcode || p.name === testProductName
    );
    expect(found, "POS-created product must appear in Retailer Dashboard").toBeTruthy();
    expect(found.sellPrice).toBe(2500);
  });

  test("2. POS-created product is searchable by barcode in Dashboard", async ({ request }) => {
    const listRes = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${testBarcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    expect(listRes.status()).toBe(200);
    const products = (await listRes.json()).data;
    expect(products.length, "Barcode search must find POS product").toBeGreaterThan(0);
  });

  test("3. POS-created product is scannable by POS lookup", async ({ request }) => {
    const lookupRes = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${testBarcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookupRes.status()).toBe(200);
    const body = await lookupRes.json();
    const price = body.data?.sell_price ?? body.data?.sellPrice;
    expect(price, "POS lookup must return correct price").toBe(2500);
  });
});
