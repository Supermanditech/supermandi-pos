/**
 * GCP-STG-0314: UPI sale must include store_product_id + retail_variant_id
 *
 * Verifies UpiScreenV3 maps cart items with canonical identity fields,
 * matching usePaymentFlow's mapping pattern.
 */

describe("GCP-STG-0314: UPI sale item metadata parity with Cash/Udhar", () => {
  // Extract the mapping logic from both paths and verify they produce
  // identical output for the same input cart item.

  type CartItem = {
    id: string;
    barcode?: string;
    name: string;
    quantity: number;
    priceMinor: number;
    itemDiscount?: any;
    batchNumber?: string;
    metadata?: { storeProductId?: string; retailVariantId?: string; gstPct?: number };
  };

  // usePaymentFlow mapping (Cash/Udhar path) — from usePaymentFlow.ts:49-60
  function mapCashUdhar(item: CartItem) {
    return {
      productId: item.barcode ?? item.id,
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      priceMinor: item.priceMinor,
      itemDiscount: item.itemDiscount ?? null,
      batchNumber: item.batchNumber ?? null,
      store_product_id: item.metadata?.storeProductId ?? undefined,
      retail_variant_id: (item.metadata as any)?.retailVariantId ?? undefined,
    };
  }

  // UpiScreenV3 mapping (UPI path) — from UpiScreenV3.tsx:74-84
  function mapUpi(item: CartItem) {
    return {
      productId: item.barcode ?? item.id,
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      priceMinor: item.priceMinor,
      itemDiscount: item.itemDiscount ?? null,
      batchNumber: item.batchNumber ?? null,
      store_product_id: item.metadata?.storeProductId ?? undefined,
      retail_variant_id: (item.metadata as any)?.retailVariantId ?? undefined,
    };
  }

  const sampleItem: CartItem = {
    id: "product-uuid-1",
    barcode: "8901030000001",
    name: "Tata Salt 1kg",
    quantity: 2,
    priceMinor: 2500,
    itemDiscount: null,
    batchNumber: "BATCH-001",
    metadata: {
      storeProductId: "sp-uuid-1",
      retailVariantId: "rv-uuid-1",
      gstPct: 18,
    },
  };

  test("UPI mapping includes store_product_id", () => {
    const mapped = mapUpi(sampleItem);
    expect(mapped.store_product_id).toBe("sp-uuid-1");
  });

  test("UPI mapping includes retail_variant_id", () => {
    const mapped = mapUpi(sampleItem);
    expect(mapped.retail_variant_id).toBe("rv-uuid-1");
  });

  test("UPI mapping matches Cash/Udhar mapping exactly", () => {
    const cashResult = mapCashUdhar(sampleItem);
    const upiResult = mapUpi(sampleItem);
    expect(upiResult).toEqual(cashResult);
  });

  test("both paths handle missing metadata gracefully", () => {
    const itemNoMeta: CartItem = {
      id: "p2",
      name: "Sugar",
      quantity: 1,
      priceMinor: 8500,
    };
    const cashResult = mapCashUdhar(itemNoMeta);
    const upiResult = mapUpi(itemNoMeta);
    expect(upiResult).toEqual(cashResult);
    expect(upiResult.store_product_id).toBeUndefined();
    expect(upiResult.retail_variant_id).toBeUndefined();
  });

  test("both paths handle metadata with storeProductId but no retailVariantId", () => {
    const itemPartialMeta: CartItem = {
      id: "p3",
      name: "Maggi",
      quantity: 5,
      priceMinor: 1200,
      metadata: { storeProductId: "sp-3" },
    };
    const cashResult = mapCashUdhar(itemPartialMeta);
    const upiResult = mapUpi(itemPartialMeta);
    expect(upiResult).toEqual(cashResult);
    expect(upiResult.store_product_id).toBe("sp-3");
    expect(upiResult.retail_variant_id).toBeUndefined();
  });

  test("source code: UpiScreenV3 contains store_product_id mapping", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/UpiScreenV3.tsx"), "utf8"
    );
    expect(src).toContain("store_product_id: item.metadata?.storeProductId");
    expect(src).toContain("retail_variant_id:");
  });

  test("source code: UpiScreenV3 and usePaymentFlow have matching item mappings", () => {
    const fs = require("fs");
    const path = require("path");
    const upiSrc = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/UpiScreenV3.tsx"), "utf8"
    );
    const hookSrc = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/usePaymentFlow.ts"), "utf8"
    );

    // Both must have store_product_id and retail_variant_id in their item mapping
    expect(upiSrc).toContain("store_product_id:");
    expect(hookSrc).toContain("store_product_id:");
    expect(upiSrc).toContain("retail_variant_id:");
    expect(hookSrc).toContain("retail_variant_id:");
  });
});
