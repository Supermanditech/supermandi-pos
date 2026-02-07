/**
 * RET-POS-SYNC-006: Bidirectional Edit Sync E2E Test
 * @retailer-pos-sync
 *
 * Proves: Edits made on POS side reflect in Dashboard, and vice versa.
 * Sync mechanism: Same DB tables + LWW via metadata_updated_at.
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

test.describe("@retailer-pos-sync Bidirectional Edit Sync", () => {
  let ctx: TestStoreContext;
  let testBarcode: string;
  let storeProductId: string;

  test("0. Setup: register store, enroll device, create product", async ({ request }) => {
    ctx = await setupTestStore(request, "editsync");
    testBarcode = uniqueBarcode();

    // Create product via Retailer Dashboard
    const createRes = await request.post(`${API_BASE}/api/v1/retailer-admin/products`, {
      headers: retailerHeaders(ctx.storeId),
      data: {
        mode: "PACKAGED",
        name: "Edit Sync Test Product",
        barcode: testBarcode,
        sellPrice: 3000,
        purchasePrice: 2500,
        mrp: 3500,
        openingStockQty: 100,
        unit: "PCS",
        brand: "OriginalBrand",
      },
    });
    expect(createRes.status(), "Retailer product creation must succeed").toBe(201);

    // Get storeProductId from list
    const listRes = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${testBarcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    const products = (await listRes.json()).data;
    storeProductId = products[0]?.id;
    expect(storeProductId, "Must find created product to get storeProductId").toBeTruthy();
  });

  test("1. POS price edit reflects in Dashboard", async ({ request }) => {
    // POS edits the price via barcode
    const patchRes = await request.patch(`${API_BASE}/api/v1/pos/store-products/price`, {
      headers: posHeaders(ctx.deviceToken),
      data: { barcode: testBarcode, sellPrice: 5000 },
    });
    expect(patchRes.status(), "POS price edit must succeed").toBeLessThan(300);

    // Dashboard sees updated price
    const listRes = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${testBarcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    const products = (await listRes.json()).data;
    const product = products.find((p: any) => p.barcode === testBarcode);
    expect(product, "Product must be found in Dashboard").toBeTruthy();
    expect(product.sellPrice, "Dashboard must see POS price edit").toBe(5000);
  });

  test("2. POS metadata edit (name/brand) reflects in Dashboard", async ({ request }) => {
    // POS updates display_name and brand
    const patchRes = await request.patch(`${API_BASE}/api/v1/pos/store-products/metadata`, {
      headers: posHeaders(ctx.deviceToken),
      data: {
        storeProductId,
        displayName: "POS Updated Name",
        brand: "POS Brand",
      },
    });
    expect(patchRes.status(), "POS metadata edit must succeed").toBeLessThan(300);

    // Dashboard sees updated name
    const listRes = await request.get(
      `${API_BASE}/api/v1/retailer-admin/products?search=${testBarcode}`,
      { headers: retailerHeaders(ctx.storeId) }
    );
    const products = (await listRes.json()).data;
    const product = products.find((p: any) => p.barcode === testBarcode);
    expect(product, "Product must be found").toBeTruthy();
    // Dashboard returns COALESCE(display_name, name) as alias or name
    const displayedName = product.alias || product.name;
    expect(displayedName, "Dashboard must see POS name edit").toBe("POS Updated Name");
  });

  test("3. Dashboard price edit reflects in POS lookup", async ({ request }) => {
    // Dashboard updates price
    const patchRes = await request.patch(
      `${API_BASE}/api/v1/retailer-admin/products/${storeProductId}`,
      {
        headers: retailerHeaders(ctx.storeId),
        data: { sellPrice: 7000 },
      }
    );
    expect(patchRes.status(), "Dashboard price edit must succeed").toBeLessThan(300);

    // POS barcode lookup sees new price
    const lookupRes = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${testBarcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookupRes.status()).toBe(200);
    const body = await lookupRes.json();
    const price = body.data?.sell_price ?? body.data?.sellPrice;
    expect(price, "POS must see Dashboard price edit").toBe(7000);
  });

  test("4. Dashboard stock edit reflects in POS lookup", async ({ request }) => {
    // Dashboard sets stock
    const patchRes = await request.patch(
      `${API_BASE}/api/v1/retailer-admin/products/${storeProductId}`,
      {
        headers: retailerHeaders(ctx.storeId),
        data: { openingStockQty: 200 },
      }
    );
    expect(patchRes.status(), "Dashboard stock edit must succeed").toBeLessThan(300);

    // POS lookup shows updated stock
    const lookupRes = await request.get(
      `${API_BASE}/api/v1/pos/store-products/lookup?barcode=${testBarcode}`,
      { headers: posHeaders(ctx.deviceToken) }
    );
    expect(lookupRes.status()).toBe(200);
    const body = await lookupRes.json();
    const stock = body.data?.current_stock ?? body.data?.currentStock;
    expect(stock, "POS must see Dashboard stock edit").toBe(200);
  });
});
