/**
 * V3-FIX-142..V3-DELETE-149: Principal procurement lane contracts
 *
 * Tests procurement lane isolation, order orchestration,
 * dual invoices, supplier visibility, GRN gating, and cleanup.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-142: Lane isolation
// ═══════════════════════════════════════════════════════════════════════════════

import {
  resolveProcurementLane,
  validateLaneIsolation,
  STOCK_EVENT_RULES,
  SUPPLIER_VISIBILITY_RULES,
  type ProcurementLane,
} from "../../src/services/procurementLane";

describe("V3-FIX-142: Procurement lane isolation (executable)", () => {
  it("standard/catalogue orders resolve to CATALOGUE_PRINCIPAL", () => {
    expect(resolveProcurementLane("standard")).toBe("CATALOGUE_PRINCIPAL");
    expect(resolveProcurementLane("catalogue_principal")).toBe("CATALOGUE_PRINCIPAL");
    expect(resolveProcurementLane(null)).toBe("CATALOGUE_PRINCIPAL");
    expect(resolveProcurementLane(undefined)).toBe("CATALOGUE_PRINCIPAL");
  });

  it("counter_purchase/manual orders resolve to COUNTER_PURCHASE", () => {
    expect(resolveProcurementLane("counter_purchase")).toBe("COUNTER_PURCHASE");
    expect(resolveProcurementLane("manual")).toBe("COUNTER_PURCHASE");
  });

  it("mixed-lane cart is rejected", () => {
    const result = validateLaneIsolation([
      { lane: "CATALOGUE_PRINCIPAL" },
      { lane: "COUNTER_PURCHASE" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("MIXED_PROCUREMENT_LANES");
  });

  it("single-lane cart is accepted", () => {
    expect(validateLaneIsolation([
      { lane: "CATALOGUE_PRINCIPAL" },
      { lane: "CATALOGUE_PRINCIPAL" },
    ]).valid).toBe(true);

    expect(validateLaneIsolation([
      { lane: "COUNTER_PURCHASE" },
    ]).valid).toBe(true);
  });

  it("empty cart is valid", () => {
    expect(validateLaneIsolation([]).valid).toBe(true);
  });

  it("BuyScreenV3 tags orders as catalogue_principal (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/screens/v3/BuyScreenV3.tsx"), "utf8"
    );
    expect(src).toContain("catalogue_principal");
    expect(src).not.toContain('orderType: "standard"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-143: Supplier visibility rules
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-143: Supplier order visibility (executable)", () => {
  it("pre-acceptance hides retailer identity", () => {
    const rules = SUPPLIER_VISIBILITY_RULES.pre_acceptance;
    expect(rules.orderId).toBe(true);
    expect(rules.items).toBe(true);
    expect(rules.quantities).toBe(true);
    expect(rules.deliveryCity).toBe(true);
    expect(rules.retailerName).toBe(false);
    expect(rules.retailerPhone).toBe(false);
    expect(rules.retailerEmail).toBe(false);
    expect(rules.deliveryFullAddress).toBe(false);
  });

  it("post-acceptance reveals only dispatch-necessary info", () => {
    const rules = SUPPLIER_VISIBILITY_RULES.post_acceptance;
    expect(rules.retailerName).toBe(true); // For dispatch label
    expect(rules.deliveryFullAddress).toBe(true); // For shipping
    expect(rules.retailerPhone).toBe(false); // SuperMandi handles comms
    expect(rules.retailerEmail).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-145: Dual invoice chain
// ═══════════════════════════════════════════════════════════════════════════════

import {
  validateInvoicePairCompleteness,
  type DualInvoicePair,
} from "../../src/services/dualInvoiceService";

describe("V3-FIX-145: Dual invoice chain (executable)", () => {
  it("complete invoice pair passes validation", () => {
    const pair: DualInvoicePair = {
      retailerOrderId: "ro-1",
      supplierProcurementId: "sp-1",
      supplierInvoice: {
        invoiceId: "inv-s1", type: "SUPPLIER_TO_SUPERMANDI",
        status: "generated", uploadedBy: "supplier",
        fileRef: "gs://docs/inv-s1.pdf", generatedAt: "2026-03-19T00:00:00Z",
      },
      retailerInvoice: {
        invoiceId: "inv-r1", type: "SUPERMANDI_TO_RETAILER",
        status: "generated", generatedBy: "system",
        fileRef: "gs://docs/inv-r1.pdf", generatedAt: "2026-03-19T00:00:00Z",
      },
    };
    const result = validateInvoicePairCompleteness(pair);
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("missing supplier invoice fails validation", () => {
    const pair: DualInvoicePair = {
      retailerOrderId: "ro-1", supplierProcurementId: "sp-1",
      supplierInvoice: { invoiceId: null, type: "SUPPLIER_TO_SUPERMANDI", status: "draft", uploadedBy: "supplier", fileRef: null, generatedAt: null },
      retailerInvoice: { invoiceId: "inv-r1", type: "SUPERMANDI_TO_RETAILER", status: "generated", generatedBy: "system", fileRef: "ref", generatedAt: "2026-03-19" },
    };
    const result = validateInvoicePairCompleteness(pair);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("Supplier invoice not uploaded");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-146: Stock event timing
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-146: Stock event rules per lane (executable)", () => {
  it("catalogue-principal stock enters only on GRN_CONFIRMED", () => {
    const rules = STOCK_EVENT_RULES.CATALOGUE_PRINCIPAL;
    expect(rules.stockCreditEvent).toBe("GRN_CONFIRMED");
    expect(rules.checkoutCreditsStock).toBe(false);
  });

  it("counter-purchase stock enters immediately", () => {
    const rules = STOCK_EVENT_RULES.COUNTER_PURCHASE;
    expect(rules.stockCreditEvent).toBe("MANUAL_INWARD");
    expect(rules.checkoutCreditsStock).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-DELETE-149: Cleanup verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-DELETE-149: No direct-supplier catalogue checkout (static — narrowly scoped)", () => {
  it("BuyScreenV3 does not use direct supplier checkout", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/screens/v3/BuyScreenV3.tsx"), "utf8"
    );
    // Must use catalogue_principal, not direct supplier
    expect(src).toContain("catalogue_principal");
    // Counter Purchase is a separate screen, not in BUY
    expect(src).not.toContain("counter_purchase");
  });
});
