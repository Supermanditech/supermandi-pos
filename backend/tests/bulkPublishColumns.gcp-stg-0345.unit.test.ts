/**
 * GCP-STG-0345: Bulk publish INSERT must include conversion/mode columns
 * that match the single-publish path.
 *
 * Missing columns before fix: procurement_unit, procurement_pack_qty,
 * base_stock_unit, allow_fractional_sell, conversion_confirmed,
 * product_mode, sold_by, rate_unit.
 *
 * This test validates the resolution logic that mirrors V3-FIX-169
 * in the single-publish path.
 */

import { inferBaseStockUnit } from "../src/services/conversionEngine";

describe("GCP-STG-0345: bulk publish conversion/mode column resolution", () => {
  // Helper: mirrors the resolution logic added to publish-bulk endpoint
  function resolveColumns(p: {
    base_stock_unit?: string | null;
    procurement_unit?: string | null;
    procurement_pack_qty?: number | null;
    sell_unit?: string | null;
    split_sell_eligible?: boolean | null;
    unit?: string;
  }) {
    const bulkBaseStockUnit = p.base_stock_unit || inferBaseStockUnit(null, null, null, p.unit || null);
    const bulkProcurementUnit = p.procurement_unit || bulkBaseStockUnit;
    const bulkPackQty = p.procurement_pack_qty || 1;
    const bulkSellUnit = p.sell_unit || bulkBaseStockUnit;
    const bulkSoldBy = ['KG', 'GM', 'LTR', 'ML'].includes(bulkSellUnit) ? 'WEIGHT' : 'COUNT';
    const bulkRateUnit = bulkSellUnit;
    const bulkProductMode = p.split_sell_eligible || bulkSoldBy === 'WEIGHT' ? 'LOOSE_BULK' : 'PACKAGED';

    return {
      base_stock_unit: bulkBaseStockUnit,
      procurement_unit: bulkProcurementUnit,
      procurement_pack_qty: bulkPackQty,
      sell_unit: bulkSellUnit,
      sold_by: bulkSoldBy,
      rate_unit: bulkRateUnit,
      product_mode: bulkProductMode,
      allow_fractional_sell: p.split_sell_eligible || false,
    };
  }

  it("resolves packaged product with explicit fields", () => {
    const result = resolveColumns({
      base_stock_unit: "PCS",
      procurement_unit: "BOX",
      procurement_pack_qty: 12,
      sell_unit: "PCS",
      split_sell_eligible: false,
      unit: "PCS",
    });
    expect(result.base_stock_unit).toBe("PCS");
    expect(result.procurement_unit).toBe("BOX");
    expect(result.procurement_pack_qty).toBe(12);
    expect(result.sold_by).toBe("COUNT");
    expect(result.product_mode).toBe("PACKAGED");
    expect(result.rate_unit).toBe("PCS");
    expect(result.allow_fractional_sell).toBe(false);
  });

  it("resolves loose/bulk product (KG unit)", () => {
    const result = resolveColumns({
      base_stock_unit: "KG",
      sell_unit: "KG",
      split_sell_eligible: true,
      unit: "KG",
    });
    expect(result.base_stock_unit).toBe("KG");
    expect(result.procurement_unit).toBe("KG"); // falls back to base_stock_unit
    expect(result.procurement_pack_qty).toBe(1); // default
    expect(result.sold_by).toBe("WEIGHT");
    expect(result.product_mode).toBe("LOOSE_BULK");
    expect(result.rate_unit).toBe("KG");
    expect(result.allow_fractional_sell).toBe(true);
  });

  it("infers base_stock_unit from unit when not set", () => {
    const result = resolveColumns({
      base_stock_unit: null,
      unit: "KG",
    });
    // inferBaseStockUnit(null,null,null,"KG") should return "KG"
    expect(result.base_stock_unit).toBe("KG");
    expect(result.procurement_unit).toBe("KG");
    expect(result.sold_by).toBe("WEIGHT");
    expect(result.product_mode).toBe("LOOSE_BULK");
  });

  it("infers PCS for non-weight units", () => {
    const result = resolveColumns({
      base_stock_unit: null,
      unit: "PACK",
    });
    expect(result.base_stock_unit).toBe("PCS"); // default for non-weight
    expect(result.sold_by).toBe("COUNT");
    expect(result.product_mode).toBe("PACKAGED");
  });

  it("split_sell_eligible forces LOOSE_BULK even for COUNT unit", () => {
    const result = resolveColumns({
      base_stock_unit: "PCS",
      sell_unit: "PCS",
      split_sell_eligible: true,
      unit: "PCS",
    });
    expect(result.sold_by).toBe("COUNT");
    expect(result.product_mode).toBe("LOOSE_BULK"); // split_sell overrides
    expect(result.allow_fractional_sell).toBe(true);
  });

  it("LTR unit resolves to WEIGHT sold_by", () => {
    const result = resolveColumns({
      base_stock_unit: "LTR",
      sell_unit: "ML",
      unit: "LTR",
    });
    expect(result.sold_by).toBe("WEIGHT");
    expect(result.rate_unit).toBe("ML");
    expect(result.product_mode).toBe("LOOSE_BULK");
  });

  it("procurement_pack_qty defaults to 1 when not set", () => {
    const result = resolveColumns({
      base_stock_unit: "PCS",
      procurement_pack_qty: null,
      unit: "PCS",
    });
    expect(result.procurement_pack_qty).toBe(1);
  });

  it("all fields null — full inference chain", () => {
    // Simulates a minimal supplier_product with only unit set
    const result = resolveColumns({
      base_stock_unit: null,
      procurement_unit: null,
      procurement_pack_qty: null,
      sell_unit: null,
      split_sell_eligible: null,
      unit: "GM",
    });
    // GM → infer base_stock_unit = KG (weight family)
    expect(result.base_stock_unit).toBe("KG");
    expect(result.procurement_unit).toBe("KG");
    expect(result.procurement_pack_qty).toBe(1);
    expect(result.sold_by).toBe("WEIGHT");
    expect(result.product_mode).toBe("LOOSE_BULK");
    expect(result.allow_fractional_sell).toBe(false);
  });
});
