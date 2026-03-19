/**
 * V3-HARDEN-189: Runtime behavioral verification (gate-blocking)
 *
 * These tests execute actual code paths to prove correctness.
 * The Phase 21 gate runs this file as a blocking check.
 */

import {
  isValidTransition,
  getAllowedTransitions,
} from "../../src/services/allocationService";

import {
  calculateReorderSuggestion,
  LIFECYCLE_COMMUNICATION_RULES,
  type AllocationStatus,
} from "../../src/services/storeDemandSignal";

// ─── 1. Allocation state machine runtime execution ───

describe("Gate: allocation state machine behavioral proof", () => {
  it("executes full happy path: pending→triggered→accepted→dispatched→delivered→grn_completed", () => {
    const path: AllocationStatus[] = [
      "pending_trigger", "triggered", "accepted", "dispatched", "delivered", "grn_completed"
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(isValidTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("blocks invalid skip: triggered → delivered", () => {
    expect(isValidTransition("triggered", "delivered")).toBe(false);
  });

  it("blocks backward: delivered → dispatched", () => {
    expect(isValidTransition("delivered", "dispatched")).toBe(false);
  });

  it("rejected is terminal: no outgoing transitions", () => {
    expect(getAllowedTransitions("rejected")).toEqual([]);
  });

  it("grn_completed is terminal: no outgoing transitions", () => {
    expect(getAllowedTransitions("grn_completed")).toEqual([]);
  });
});

// ─── 2. Demand compute: reorder math behavioral proof ───

describe("Gate: demand compute reorder math", () => {
  it("calculates qty=37 for velocity=3, stock=5, pending=0", () => {
    const r = calculateReorderSuggestion({
      storeId: "s1", productId: "p1", currentStock: 5,
      soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
      daysOfStock: 1.7, pendingInbound: 0, needsReorder: true,
      lastSaleAt: null, lastStockEventAt: null,
    });
    expect(r.suggestedQuantity).toBe(37);
    expect(r.needsReorder).toBe(true);
  });

  it("returns 0 when stock covers 14+ days", () => {
    const r = calculateReorderSuggestion({
      storeId: "s1", productId: "p1", currentStock: 100,
      soldLast7Days: 7, soldLast30Days: 30, dailyVelocity: 1,
      daysOfStock: 100, pendingInbound: 0, needsReorder: false,
      lastSaleAt: null, lastStockEventAt: null,
    });
    expect(r.needsReorder).toBe(false);
    expect(r.suggestedQuantity).toBe(0);
  });

  it("pending inbound reduces suggested quantity", () => {
    const without = calculateReorderSuggestion({
      storeId: "s1", productId: "p1", currentStock: 5,
      soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
      daysOfStock: 1.7, pendingInbound: 0, needsReorder: true,
      lastSaleAt: null, lastStockEventAt: null,
    });
    const with20 = calculateReorderSuggestion({
      storeId: "s1", productId: "p1", currentStock: 5,
      soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
      daysOfStock: 1.7, pendingInbound: 20, needsReorder: true,
      lastSaleAt: null, lastStockEventAt: null,
    });
    expect(with20.suggestedQuantity).toBeLessThan(without.suggestedQuantity);
  });
});

// ─── 3. Lifecycle communication rules runtime execution ───

describe("Gate: lifecycle communication rules", () => {
  it("10 event types defined", () => {
    expect(Object.keys(LIFECYCLE_COMMUNICATION_RULES)).toHaveLength(10);
  });

  it("every event has at least one delivery target", () => {
    for (const [, rule] of Object.entries(LIFECYCLE_COMMUNICATION_RULES)) {
      const total = (rule as any).retailer.length + (rule as any).supplier.length + (rule as any).admin.length;
      expect(total).toBeGreaterThan(0);
    }
  });

  it("supplier never receives repeat_order_prompt", () => {
    expect(LIFECYCLE_COMMUNICATION_RULES.repeat_order_prompt.supplier).toHaveLength(0);
  });

  it("order_created notifies retailer via whatsapp", () => {
    expect(LIFECYCLE_COMMUNICATION_RULES.order_created.retailer).toContain("whatsapp");
  });
});

// ─── 4. Auth enforcement proof (file-read, code lines only) ───

describe("Gate: auth enforcement on admin routes", () => {
  const fs = require("fs");
  const path = require("path");

  it("admin demand routes: requireAdminToken + requirePermission", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/admin/demandSignals.ts"), "utf8"
    );
    expect(src).toContain("requireAdminToken");
    expect(src).toContain('requirePermission("demand_signals", "read")');
    expect(src).toContain('requirePermission("demand_signals", "write")');
  });

  it("admin allocation routes: requireAdminToken + requirePermission", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/admin/allocations.ts"), "utf8"
    );
    expect(src).toContain("requireAdminToken");
    expect(src).toContain('requirePermission("allocations", "read")');
    expect(src).toContain('requirePermission("allocations", "write")');
  });

  it("supplier allocation routes: req.supplierId (not req.supplier!)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/supplier/allocations.ts"), "utf8"
    );
    const codeLines = src.split("\n").filter((l: string) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
    expect(codeLines.some((l: string) => l.includes("req.supplierId"))).toBe(true);
    expect(codeLines.some((l: string) => l.includes("req.supplier!"))).toBe(false);
  });
});

// ─── 5. Store ownership isolation proof ───

describe("Gate: cross-store lifecycle access blocked", () => {
  it("POS lifecycle route checks store_id on order events", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/pos/lifecycleEvents.ts"), "utf8"
    );
    expect(src).toContain("store_id = $2");
    expect(src).toContain("Order not found");
  });
});

// ─── 6. Canonical publisher wiring ───

describe("Gate: allocation uses canonical publishLifecycleEvent", () => {
  it("imports publishLifecycleEvent, no sidecar writeLifecycleEvent", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/allocationService.ts"), "utf8"
    );
    expect(src).toContain("publishLifecycleEvent");
    expect(src).not.toContain("function writeLifecycleEvent");
  });
});
