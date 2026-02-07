/**
 * RET-POS-SYNC-008: Store Isolation E2E Test
 * @retailer-pos-sync
 *
 * Proves: Products from Store A never appear in Store B (POS or Dashboard).
 * Multi-tenancy enforced via store_id scoping in all queries.
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

test.describe("@retailer-pos-sync Store Isolation", () => {
  let storeA: TestStoreContext;
  let storeB: TestStoreContext;

  test("0. Setup: register two independent stores with POS devices", async ({ request }) => {
    storeA = await setupTestStore(request, "iso-a");
    storeB = await setupTestStore(request, "iso-b");
    expect(storeA.storeId).not.toBe(storeB.storeId);
  });

  test("1. Dashboard product in Store A invisible in Store B POS and Dashboard", async ({ request }) => {
    const barcode = uniqueBarcode();

    // Create product in Store A
    const createRes = await request.post(`${API_BASE}/api/v1/retailer-admin/products`, {
      headers: retailerHeaders(storeA.storeId),
      data: {
        mode: "PACKAGED",
        name: "Store A Product",
        barcode,
        sellPrice: 1000,
        purchasePrice: 800,
        unit: "PCS",
      },
    });
    expect(createRes.status()).toBe(201);

    // POS scan in Store B → 404
    const lookupB = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers: posHeaders(storeB.deviceToken) }
    );
    expect(lookupB.status(), "Store A product must NOT appear in Store B POS").toBe(404);

    // Dashboard list in Store B → not found
    const listB = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${barcode}`,
      { headers: retailerHeaders(storeB.storeId) }
    );
    const productsB = (await listB.json()).data;
    const found = productsB.find((p: any) => p.barcode === barcode);
    expect(found, "Store A product must NOT appear in Store B Dashboard").toBeFalsy();
  });

  test("2. POS product in Store A invisible in Store B Dashboard", async ({ request }) => {
    const barcode = uniqueBarcode();

    // POS creates product in Store A
    const createRes = await request.post(`${API_BASE}/api/v1/pos/store-products`, {
      headers: posHeaders(storeA.deviceToken),
      data: {
        barcode,
        name: "POS Store A Only",
        sellPrice: 500,
        unit: "PCS",
      },
    });
    expect(createRes.status()).toBe(201);

    // Dashboard list in Store B → not found
    const listB = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${barcode}`,
      { headers: retailerHeaders(storeB.storeId) }
    );
    const productsB = (await listB.json()).data;
    const found = productsB.find((p: any) => p.barcode === barcode);
    expect(found, "POS product in Store A must NOT appear in Store B").toBeFalsy();
  });

  test("3. Same barcode in two stores are independent products", async ({ request }) => {
    const barcode = uniqueBarcode();

    // Create product with barcode X in Store A (price 1000)
    const createA = await request.post(`${API_BASE}/api/v1/retailer-admin/products`, {
      headers: retailerHeaders(storeA.storeId),
      data: {
        mode: "PACKAGED",
        name: "Independent A",
        barcode,
        sellPrice: 1000,
        purchasePrice: 800,
        unit: "PCS",
      },
    });
    expect(createA.status()).toBe(201);

    // Create product with same barcode X in Store B (price 2000)
    const createB = await request.post(`${API_BASE}/api/v1/retailer-admin/products`, {
      headers: retailerHeaders(storeB.storeId),
      data: {
        mode: "PACKAGED",
        name: "Independent B",
        barcode,
        sellPrice: 2000,
        purchasePrice: 1500,
        unit: "PCS",
      },
    });
    expect(createB.status()).toBe(201);

    // POS scan in Store A → price 1000
    const lookupA = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers: posHeaders(storeA.deviceToken) }
    );
    expect(lookupA.status()).toBe(200);
    const productA = (await lookupA.json()).data;
    const priceA = productA?.sell_price ?? productA?.sellPrice;
    expect(priceA, "Store A must have price 1000").toBe(1000);

    // POS scan in Store B → price 2000
    const lookupB = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers: posHeaders(storeB.deviceToken) }
    );
    expect(lookupB.status()).toBe(200);
    const productB = (await lookupB.json()).data;
    const priceB = productB?.sell_price ?? productB?.sellPrice;
    expect(priceB, "Store B must have price 2000").toBe(2000);
  });
});
