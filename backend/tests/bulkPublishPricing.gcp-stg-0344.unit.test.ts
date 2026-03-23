/**
 * GCP-STG-0344: Bulk publish must use calculateRetailerPrice() — same as single publish.
 *
 * Validates that the pricing engine handles:
 *   1. Fixed margin (supermandi_margin_minor)
 *   2. Percentage margin (margin_percent)
 *   3. MRP cap (retailer price capped at MRP)
 *   4. Global default fallback (8% when no margins set)
 */

import { calculateRetailerPrice } from "../src/services/pricingEngine";

describe("GCP-STG-0344: bulk publish pricing parity", () => {
  it("uses fixed margin when supermandi_margin_minor > 0", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000, // ₹100.00
      productMargin: { type: "fixed", value: 500 }, // ₹5.00 fixed
      supplierMargin: null,
    });
    expect(result.retailerPriceMinor).toBe(10500);
    expect(result.marginSource).toBe("product");
  });

  it("uses percentage margin when only margin_percent > 0", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      productMargin: null,
      supplierMargin: { type: "percentage", value: 10 }, // 10%
    });
    expect(result.retailerPriceMinor).toBe(11000);
    expect(result.marginSource).toBe("supplier");
  });

  it("caps retailer price at MRP", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      mrpMinor: 10200, // MRP ₹102.00
      productMargin: { type: "fixed", value: 500 }, // would be ₹105.00
      supplierMargin: null,
    });
    // Should be capped at MRP
    expect(result.retailerPriceMinor).toBe(10200);
  });

  it("falls back to global default (8%) when no margins set", () => {
    // OLD inline math would produce margin=0 → sell_price = purchase_price
    // NEW pricing engine applies 8% default
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      productMargin: null,
      supplierMargin: null,
    });
    expect(result.retailerPriceMinor).toBe(10800); // 10000 * 1.08
    expect(result.marginSource).toBe("global");
  });

  it("fixed margin takes precedence over percentage margin", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      productMargin: { type: "fixed", value: 300 },
      supplierMargin: { type: "percentage", value: 15 },
    });
    expect(result.retailerPriceMinor).toBe(10300);
    expect(result.marginSource).toBe("product");
  });

  it("rounds percentage margin to nearest paisa", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 999, // ₹9.99
      productMargin: null,
      supplierMargin: { type: "percentage", value: 7 },
    });
    // 999 * 1.07 = 1068.93 → Math.round = 1069
    expect(result.retailerPriceMinor).toBe(1069);
  });

  it("inline math divergence: old code gave 0 margin, new gives 8% default", () => {
    // This is the exact bug GCP-STG-0344 fixes:
    // Old inline: margin=0 when both supermandi_margin_minor=0 and margin_percent=0
    //             sell_price = purchase_price + 0 = purchase_price (zero markup!)
    // New engine: falls back to 8% global default
    const purchasePrice = 5000;
    const oldInlineMargin = 0; // both margins zero → margin stays 0
    const oldSellPrice = purchasePrice + oldInlineMargin;

    const newResult = calculateRetailerPrice({
      supplierPriceMinor: purchasePrice,
      productMargin: null,
      supplierMargin: null,
    });

    expect(oldSellPrice).toBe(5000); // old: sold at cost!
    expect(newResult.retailerPriceMinor).toBe(5400); // new: 8% markup
    expect(newResult.retailerPriceMinor).toBeGreaterThan(oldSellPrice);
  });
});
