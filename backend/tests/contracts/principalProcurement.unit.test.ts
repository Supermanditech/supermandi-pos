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

  it("order creation route accepts catalogue_principal and sets procurement_lane (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/orders.ts"), "utf8"
    );
    expect(src).toContain('"catalogue_principal"');
    expect(src).toContain("resolveProcurementLane");
    expect(src).toContain("procurement_lane");
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

describe("V3-FIX-143: Supplier orders route uses staged disclosure (static — narrowly scoped)", () => {
  it("supplier orders route imports and uses SUPPLIER_VISIBILITY_RULES", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/supplier/orders.ts"), "utf8"
    );
    expect(src).toContain("SUPPLIER_VISIBILITY_RULES");
    expect(src).toContain("pre_acceptance");
    expect(src).toContain("post_acceptance");
    // List route hides store identity
    expect(src).toContain("listVisibility.retailerName");
    // Detail route gates by acceptance phase
    expect(src).toContain("vis.retailerName");
    expect(src).toContain("vis.retailerPhone");
    expect(src).toContain("vis.deliveryFullAddress");
  });
});

describe("V3-HARDEN-147: Migration has constraints (static — narrowly scoped)", () => {
  it("migration 196 includes CHECK constraints and indexes", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../migrations/196_principal_procurement_support.sql"), "utf8"
    );
    expect(src).toContain("chk_procurement_lane");
    expect(src).toContain("chk_invoice_dispatch_type");
    expect(src).toContain("chk_dispatch_status");
    expect(src).toContain("idx_invoice_dispatch_invoice_id");
    expect(src).toContain("idx_purchase_orders_procurement_lane");
  });
});

describe("V3-HARDEN-148: Deploy gate wired (static — narrowly scoped)", () => {
  it("deploy.yml includes principal-procurement-gate.sh", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", ".github/workflows/deploy.yml"), "utf8"
    );
    expect(src).toContain("principal-procurement-gate.sh");
  });

  it("gate script checks correct migration 196", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "scripts/gates/principal-procurement-gate.sh"), "utf8"
    );
    expect(src).toContain("196_principal_procurement_support.sql");
    expect(src).not.toContain("195_principal_procurement_support.sql");
  });
});

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
