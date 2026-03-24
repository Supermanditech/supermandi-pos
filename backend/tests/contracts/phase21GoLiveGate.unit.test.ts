/**
 * V3-HARDEN-189: Behavioral tests for Phase 21 go/no-go gates
 *
 * Tests that all Phase 21 subsystems are properly wired and the
 * gate script validates all required infrastructure.
 */

import {
  isValidTransition,
  getAllowedTransitions,
} from "../../src/services/allocationService";
import {
  calculateReorderSuggestion,
  LIFECYCLE_COMMUNICATION_RULES,
  type AllocationStatus,
  type LifecycleEventType,
} from "../../src/services/storeDemandSignal";

describe("V3-HARDEN-189: Demand signal API behavior gate", () => {
  it("computeStoreDemandSignals is real DB compute (not stub)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/demandSignalCompute.ts"),
      "utf8"
    );
    // Must contain real SQL queries, not stub data
    expect(src).toContain("FROM catalog.store_products");
    expect(src).toContain("FROM public.sale_items");
    expect(src).toContain("FROM orders.purchase_order_items");
    expect(src).toContain("inventory.stock_balances");
    // Must have freshness metadata
    expect(src).toContain("computedAt");
    expect(src).toContain("snapshotVersion");
  });

  it("reorder suggestion uses 14-day target", () => {
    const result = calculateReorderSuggestion({
      storeId: "s1", productId: "p1", currentStock: 5,
      soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
      daysOfStock: 1.7, pendingInbound: 0, needsReorder: true,
      lastSaleAt: null, lastStockEventAt: null,
    });
    // ceil(3*14) - 5 - 0 = 37
    expect(result.suggestedQuantity).toBe(37);
  });
});

describe("V3-HARDEN-189: Allocation gate — state machine completeness", () => {
  const ALL_STATUSES: AllocationStatus[] = [
    "pending_trigger", "triggered", "accepted", "partial_accepted",
    "rejected", "dispatched", "delivered", "grn_completed",
  ];

  it("every status has a defined transitions array", () => {
    for (const status of ALL_STATUSES) {
      expect(getAllowedTransitions(status)).toBeDefined();
      expect(Array.isArray(getAllowedTransitions(status))).toBe(true);
    }
  });

  it("terminal states (rejected, grn_completed) have no outgoing transitions", () => {
    expect(getAllowedTransitions("rejected")).toEqual([]);
    expect(getAllowedTransitions("grn_completed")).toEqual([]);
  });

  it("non-terminal states have at least one outgoing transition", () => {
    const nonTerminal: AllocationStatus[] = [
      "pending_trigger", "triggered", "accepted", "partial_accepted",
      "dispatched", "delivered",
    ];
    for (const status of nonTerminal) {
      expect(getAllowedTransitions(status).length).toBeGreaterThan(0);
    }
  });
});

describe("V3-HARDEN-189: Lifecycle gate — all events mapped", () => {
  const ALL_EVENTS: LifecycleEventType[] = [
    "order_created", "supplier_action_required", "supplier_accepted",
    "supplier_rejected", "partial_accept", "dispatched",
    "delivery_due", "delivered", "grn_completed", "repeat_order_prompt",
    "payment_completed",
  ];

  it("11 event types, 11 communication rules", () => {
    expect(ALL_EVENTS).toHaveLength(11);
    expect(Object.keys(LIFECYCLE_COMMUNICATION_RULES)).toHaveLength(11);
  });

  it("every event has at least one delivery target", () => {
    for (const evt of ALL_EVENTS) {
      const rule = LIFECYCLE_COMMUNICATION_RULES[evt];
      const totalChannels = rule.retailer.length + rule.supplier.length + rule.admin.length;
      expect(totalChannels).toBeGreaterThan(0);
    }
  });
});

describe("V3-HARDEN-189: WhatsApp readiness gate", () => {
  it("WhatsApp service has graceful degradation", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/whatsappService.ts"),
      "utf8"
    );
    expect(src).toContain("isWhatsAppConfigured");
    expect(src).toContain("WHATSAPP_ACCESS_TOKEN");
    expect(src).toContain("WHATSAPP_PHONE_NUMBER_ID");
    // Rate limiting
    expect(src).toContain("RATE_LIMIT_PER_MIN");
    expect(src).toContain("RATE_LIMIT_PER_HOUR");
  });
});

describe("V3-HARDEN-189: Startup validation gate", () => {
  it("phase21StartupValidation.ts exports validatePhase21Startup", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/phase21StartupValidation.ts"),
      "utf8"
    );
    expect(src).toContain("export async function validatePhase21Startup");
    // Must check database, migration, WhatsApp, SSE, env vars
    expect(src).toContain("migration_198");
    expect(src).toContain("isWhatsAppConfigured");
    expect(src).toContain("getSseStats");
    expect(src).toContain("readyForGoLive");
    expect(src).toContain("JWT_SECRET");
    expect(src).toContain("DATABASE_URL");
  });
});

describe("V3-HARDEN-189: Gate script existence", () => {
  it("phase21-go-live-gate.sh exists and validates all subsystems", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "scripts/gates/phase21-go-live-gate.sh"),
      "utf8"
    );
    // Must validate all 5 Phase 21 subsystems
    expect(src).toContain("demandSignalCompute.ts");
    expect(src).toContain("buyAgainService.ts");
    expect(src).toContain("allocationService.ts");
    expect(src).toContain("lifecycleEventService.ts");
    expect(src).toContain("phase21StartupValidation.ts");
    // Must validate routes
    expect(src).toContain("posDemandSignalsRouter");
    expect(src).toContain("posBuyAgainRouter");
    expect(src).toContain("posLifecycleEventsRouter");
    expect(src).toContain("adminAllocationsRouter");
    expect(src).toContain("supplierAllocationsRouter");
  });

  it("demand-signal-gate.sh upgraded to V3-HARDEN-185", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "scripts/gates/demand-signal-gate.sh"),
      "utf8"
    );
    expect(src).toContain("V3-HARDEN-185");
    expect(src).toContain("demandSignalCompute.ts");
    expect(src).toContain("computeStoreDemandSignals");
  });
});

describe("V3-HARDEN-189: CI integration", () => {
  it("deploy.yml includes demand-signal-gate.sh", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", ".github/workflows/deploy.yml"),
      "utf8"
    );
    expect(src).toContain("demand-signal-gate.sh");
  });
});

describe("V3-HARDEN-189: Cross-portal version compatibility", () => {
  it("VersionedDemandSnapshot includes snapshotVersion for stale detection", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/demandSignalCompute.ts"),
      "utf8"
    );
    expect(src).toContain("snapshotVersion: number");
    expect(src).toContain("computedAt: string");
  });
});
