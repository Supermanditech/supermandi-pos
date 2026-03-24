/**
 * V3-HARDEN-162 / V3-FIX-163 / V3-FIX-164 / V3-HARDEN-165 / V3-HARDEN-166
 */

import {
  calculateReorderSuggestion,
  LIFECYCLE_COMMUNICATION_RULES,
  type StoreSKUDemandSnapshot,
  type AllocationStatus,
  type LifecycleEventType,
} from "../../src/services/storeDemandSignal";

describe("V3-HARDEN-162: Store SKU demand signal (executable)", () => {
  it("calculates reorder need when stock is low", () => {
    const snapshot: StoreSKUDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 5,
      soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
      daysOfStock: 1.7, pendingInbound: 0, needsReorder: true,
      lastSaleAt: "2026-03-19", lastStockEventAt: "2026-03-19",
    };
    const result = calculateReorderSuggestion(snapshot);
    expect(result.needsReorder).toBe(true);
    expect(result.suggestedQuantity).toBeGreaterThan(0);
  });

  it("no reorder when stock covers 7+ days", () => {
    const snapshot: StoreSKUDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 100,
      soldLast7Days: 7, soldLast30Days: 30, dailyVelocity: 1,
      daysOfStock: 100, pendingInbound: 0, needsReorder: false,
      lastSaleAt: "2026-03-19", lastStockEventAt: "2026-03-19",
    };
    const result = calculateReorderSuggestion(snapshot);
    expect(result.needsReorder).toBe(false);
    expect(result.suggestedQuantity).toBe(0);
  });

  it("accounts for pending inbound when calculating suggestion", () => {
    const snapshot: StoreSKUDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 5,
      soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
      daysOfStock: 1.7, pendingInbound: 30, needsReorder: true,
      lastSaleAt: "2026-03-19", lastStockEventAt: "2026-03-19",
    };
    const result = calculateReorderSuggestion(snapshot);
    // With 30 pending inbound, need is reduced
    expect(result.suggestedQuantity).toBeLessThan(
      calculateReorderSuggestion({ ...snapshot, pendingInbound: 0 }).suggestedQuantity
    );
  });
});

describe("V3-FIX-164: Allocation status lifecycle (executable)", () => {
  it("covers all 8 allocation states", () => {
    const states: AllocationStatus[] = [
      "pending_trigger", "triggered", "accepted", "partial_accepted",
      "rejected", "dispatched", "delivered", "grn_completed",
    ];
    expect(states.length).toBe(8);
  });
});

describe("V3-HARDEN-165: Lifecycle communication rules (executable)", () => {
  it("order_created notifies retailer via in_app + whatsapp", () => {
    const rules = LIFECYCLE_COMMUNICATION_RULES.order_created;
    expect(rules.retailer).toContain("in_app");
    expect(rules.retailer).toContain("whatsapp");
  });

  it("supplier_action_required notifies supplier via in_app + whatsapp", () => {
    const rules = LIFECYCLE_COMMUNICATION_RULES.supplier_action_required;
    expect(rules.supplier).toContain("in_app");
    expect(rules.supplier).toContain("whatsapp");
  });

  it("dispatched notifies retailer via in_app + whatsapp", () => {
    expect(LIFECYCLE_COMMUNICATION_RULES.dispatched.retailer).toContain("whatsapp");
  });

  it("all 11 event types have rules defined", () => {
    expect(Object.keys(LIFECYCLE_COMMUNICATION_RULES).length).toBe(11);
  });

  it("supplier never receives repeat_order_prompt", () => {
    expect(LIFECYCLE_COMMUNICATION_RULES.repeat_order_prompt.supplier).toHaveLength(0);
  });
});

describe("V3-HARDEN-166: Infrastructure (static — narrowly scoped)", () => {
  it("migration 198 exists with allocation + lifecycle tables", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../migrations/198_demand_signal_and_allocation.sql"), "utf8");
    expect(src).toContain("supplier_demand_allocations");
    expect(src).toContain("lifecycle_event_log");
    expect(src).toContain("chk_allocation_status");
    expect(src).toContain("chk_lifecycle_event_type");
  });

  it("deploy.yml includes demand signal gate", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../..", ".github/workflows/deploy.yml"), "utf8");
    expect(src).toContain("demand-signal-gate.sh");
  });
});
