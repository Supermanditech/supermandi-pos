/**
 * GCP-STG-0349: Sale Invoice Uses Retail (Margin-Applied) Prices
 *
 * Tests:
 * 1. buildSaleItems applies admin_retail_price_minor when set
 * 2. buildSaleItems applies admin_margin_fixed_minor when no retail price
 * 3. buildSaleItems applies admin_margin_pct when no fixed margin
 * 4. buildSaleItems keeps supplier price when no margin configured
 * 5. buildSaleItems returns items unchanged when no supplierProductIds
 * 6. Mixed items — each picks correct margin source
 */

import { buildSaleItems } from "../src/services/orderInvoiceService";
import type { InvoiceItemInput } from "../src/services/invoiceService";

// ---------------------------------------------------------------------------
// Mock pool
// ---------------------------------------------------------------------------
function makeMockPool(rows: any[]) {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  } as any;
}

const baseItem = (id: string, unitPriceMinor: number): InvoiceItemInput => ({
  supplierProductId: id,
  productName: `Product ${id}`,
  quantity: 10,
  unitPriceMinor,
  hsnCode: "1234",
  gstRate: 18,
  unit: "PCS",
});

describe("GCP-STG-0349: buildSaleItems — margin-applied retail prices", () => {
  it("uses admin_retail_price_minor when set", async () => {
    const pool = makeMockPool([
      {
        id: "sp-1",
        purchase_price: 10000,
        admin_retail_price_minor: 12500,
        admin_margin_fixed_minor: null,
        admin_margin_pct: null,
      },
    ]);

    const items = [baseItem("sp-1", 10000)];
    const result = await buildSaleItems(pool, items);

    expect(result).toHaveLength(1);
    expect(result[0].unitPriceMinor).toBe(12500);
    expect(result[0].productName).toBe("Product sp-1");
  });

  it("uses admin_margin_fixed_minor when no retail price", async () => {
    const pool = makeMockPool([
      {
        id: "sp-2",
        purchase_price: 10000,
        admin_retail_price_minor: null,
        admin_margin_fixed_minor: 1500,
        admin_margin_pct: null,
      },
    ]);

    const items = [baseItem("sp-2", 10000)];
    const result = await buildSaleItems(pool, items);

    expect(result[0].unitPriceMinor).toBe(11500); // 10000 + 1500
  });

  it("uses admin_margin_pct when no fixed margin", async () => {
    const pool = makeMockPool([
      {
        id: "sp-3",
        purchase_price: 10000,
        admin_retail_price_minor: null,
        admin_margin_fixed_minor: null,
        admin_margin_pct: "15.00",
      },
    ]);

    const items = [baseItem("sp-3", 10000)];
    const result = await buildSaleItems(pool, items);

    expect(result[0].unitPriceMinor).toBe(11500); // 10000 * 1.15
  });

  it("keeps supplier price when no margin configured", async () => {
    const pool = makeMockPool([
      {
        id: "sp-4",
        purchase_price: 10000,
        admin_retail_price_minor: null,
        admin_margin_fixed_minor: null,
        admin_margin_pct: null,
      },
    ]);

    const items = [baseItem("sp-4", 10000)];
    const result = await buildSaleItems(pool, items);

    expect(result[0].unitPriceMinor).toBe(10000); // unchanged
  });

  it("returns items unchanged when no supplierProductIds", async () => {
    const pool = makeMockPool([]);
    const items: InvoiceItemInput[] = [
      {
        productName: "Loose item",
        quantity: 5,
        unitPriceMinor: 5000,
        gstRate: 18,
        unit: "KG",
      },
    ];

    const result = await buildSaleItems(pool, items);

    expect(result).toEqual(items);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("handles mixed items — each picks correct margin source", async () => {
    const pool = makeMockPool([
      {
        id: "sp-a",
        purchase_price: 10000,
        admin_retail_price_minor: 13000,
        admin_margin_fixed_minor: 2000,
        admin_margin_pct: "20.00",
      },
      {
        id: "sp-b",
        purchase_price: 8000,
        admin_retail_price_minor: null,
        admin_margin_fixed_minor: 1000,
        admin_margin_pct: "10.00",
      },
      {
        id: "sp-c",
        purchase_price: 6000,
        admin_retail_price_minor: null,
        admin_margin_fixed_minor: null,
        admin_margin_pct: "25.00",
      },
    ]);

    const items = [
      baseItem("sp-a", 10000),
      baseItem("sp-b", 8000),
      baseItem("sp-c", 6000),
    ];

    const result = await buildSaleItems(pool, items);

    // sp-a: admin_retail_price_minor takes priority
    expect(result[0].unitPriceMinor).toBe(13000);
    // sp-b: fixed margin (no retail price)
    expect(result[1].unitPriceMinor).toBe(9000); // 8000 + 1000
    // sp-c: pct margin (no retail price, no fixed)
    expect(result[2].unitPriceMinor).toBe(7500); // 6000 * 1.25
  });

  it("queries with correct supplierProductIds", async () => {
    const pool = makeMockPool([]);
    const items = [baseItem("sp-x", 5000), baseItem("sp-y", 6000)];

    await buildSaleItems(pool, items);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("catalog.supplier_products");
    expect(params[0]).toEqual(["sp-x", "sp-y"]);
  });

  it("admin_retail_price_minor = 0 is treated as not set", async () => {
    const pool = makeMockPool([
      {
        id: "sp-z",
        purchase_price: 10000,
        admin_retail_price_minor: 0,
        admin_margin_fixed_minor: 2000,
        admin_margin_pct: null,
      },
    ]);

    const items = [baseItem("sp-z", 10000)];
    const result = await buildSaleItems(pool, items);

    // retail_price = 0 so falls through to fixed margin
    expect(result[0].unitPriceMinor).toBe(12000);
  });
});
