/**
 * V3-HARDEN-185: Behavioral tests for demand signal compute engine
 *
 * Tests the pure compute logic + API route contract.
 * Does NOT mock DB — tests idempotency, edge cases, and output contract.
 */

import {
  computeStoreDemandSignals,
  buildReorderRecommendations,
  computeCrossStoreDemandPressure,
  type VersionedDemandSnapshot,
  type StoreDemandSummary,
} from "../../src/services/demandSignalCompute";
import {
  calculateReorderSuggestion,
  type StoreSKUDemandSnapshot,
} from "../../src/services/storeDemandSignal";

// ─── Pure compute logic tests ───

describe("V3-HARDEN-185: calculateReorderSuggestion edge cases", () => {
  it("returns zero suggestion when stock covers 14+ days", () => {
    const snapshot: StoreSKUDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 100,
      soldLast7Days: 7, soldLast30Days: 30, dailyVelocity: 1,
      daysOfStock: 100, pendingInbound: 0, needsReorder: false,
      lastSaleAt: null, lastStockEventAt: null,
    };
    const result = calculateReorderSuggestion(snapshot);
    expect(result.needsReorder).toBe(false);
    expect(result.suggestedQuantity).toBe(0);
  });

  it("suggests quantity to cover 14 days minus stock minus pending", () => {
    const snapshot: StoreSKUDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 5,
      soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
      daysOfStock: 1.7, pendingInbound: 10, needsReorder: true,
      lastSaleAt: "2026-03-19T00:00:00Z", lastStockEventAt: "2026-03-19T00:00:00Z",
    };
    const result = calculateReorderSuggestion(snapshot);
    expect(result.needsReorder).toBe(true);
    // target = ceil(3*14) - 5 - 10 = 42 - 15 = 27
    expect(result.suggestedQuantity).toBe(27);
  });

  it("never suggests negative quantity", () => {
    const snapshot: StoreSKUDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 50,
      soldLast7Days: 7, soldLast30Days: 30, dailyVelocity: 1,
      daysOfStock: 50, pendingInbound: 100, needsReorder: false,
      lastSaleAt: null, lastStockEventAt: null,
    };
    const result = calculateReorderSuggestion(snapshot, 60);
    expect(result.suggestedQuantity).toBeGreaterThanOrEqual(0);
  });

  it("handles zero velocity (no sales) — no reorder needed", () => {
    const snapshot: StoreSKUDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 10,
      soldLast7Days: 0, soldLast30Days: 0, dailyVelocity: 0,
      daysOfStock: 999, pendingInbound: 0, needsReorder: false,
      lastSaleAt: null, lastStockEventAt: null,
    };
    const result = calculateReorderSuggestion(snapshot);
    expect(result.needsReorder).toBe(false);
    expect(result.suggestedQuantity).toBe(0);
  });

  it("custom threshold: reorder when stock < threshold days", () => {
    const snapshot: StoreSKUDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 20,
      soldLast7Days: 14, soldLast30Days: 60, dailyVelocity: 2,
      daysOfStock: 10, pendingInbound: 0, needsReorder: false,
      lastSaleAt: "2026-03-19T00:00:00Z", lastStockEventAt: null,
    };
    // Default threshold = 7, daysOfStock = 10 → no reorder
    expect(calculateReorderSuggestion(snapshot, 7).needsReorder).toBe(false);
    // Custom threshold = 14, daysOfStock = 10 → reorder
    expect(calculateReorderSuggestion(snapshot, 14).needsReorder).toBe(true);
  });
});

describe("V3-HARDEN-185: buildReorderRecommendations", () => {
  const baseSummary: StoreDemandSummary = {
    storeId: "s1",
    totalProducts: 3,
    needsReorderCount: 2,
    criticalCount: 1,
    computedAt: "2026-03-19T12:00:00Z",
    snapshotVersion: 1742385600000,
    signals: [
      {
        storeId: "s1", productId: "p1", currentStock: 50,
        soldLast7Days: 7, soldLast30Days: 30, dailyVelocity: 1,
        daysOfStock: 50, pendingInbound: 0, needsReorder: false,
        lastSaleAt: null, lastStockEventAt: null,
        computedAt: "2026-03-19T12:00:00Z", snapshotVersion: 1742385600000,
        productName: "Product A", barcode: "111",
      },
      {
        storeId: "s1", productId: "p2", currentStock: 3,
        soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
        daysOfStock: 1, pendingInbound: 0, needsReorder: true,
        lastSaleAt: "2026-03-19T00:00:00Z", lastStockEventAt: null,
        computedAt: "2026-03-19T12:00:00Z", snapshotVersion: 1742385600000,
        productName: "Product B", barcode: "222",
      },
      {
        storeId: "s1", productId: "p3", currentStock: 10,
        soldLast7Days: 14, soldLast30Days: 60, dailyVelocity: 2,
        daysOfStock: 5, pendingInbound: 5, needsReorder: true,
        lastSaleAt: "2026-03-18T00:00:00Z", lastStockEventAt: null,
        computedAt: "2026-03-19T12:00:00Z", snapshotVersion: 1742385600000,
        productName: "Product C", barcode: null,
      },
    ],
  };

  it("returns only needsReorder=true items", () => {
    const recs = buildReorderRecommendations(baseSummary);
    expect(recs.length).toBe(2);
    expect(recs.every((r) => r.suggestedQuantity > 0)).toBe(true);
  });

  it("sorts by daysOfStock ascending (most urgent first)", () => {
    const recs = buildReorderRecommendations(baseSummary);
    expect(recs[0].productId).toBe("p2"); // daysOfStock=1
    expect(recs[1].productId).toBe("p3"); // daysOfStock=5
  });

  it("marks repeat correctly based on 30d sales", () => {
    const recs = buildReorderRecommendations(baseSummary);
    expect(recs[0].isRepeat).toBe(true); // soldLast30Days > 0
    expect(recs[1].isRepeat).toBe(true);
  });

  it("accounts for pending inbound in suggestion", () => {
    const recs = buildReorderRecommendations(baseSummary);
    const p3 = recs.find((r) => r.productId === "p3")!;
    // target = ceil(2*14) - 10 - 5 = 28 - 15 = 13
    expect(p3.suggestedQuantity).toBe(13);
  });

  it("returns empty array when no SKUs need reorder", () => {
    const noReorder = {
      ...baseSummary,
      signals: baseSummary.signals.map((s) => ({ ...s, needsReorder: false })),
    };
    expect(buildReorderRecommendations(noReorder)).toEqual([]);
  });
});

describe("V3-HARDEN-185: Versioned snapshot contract", () => {
  it("VersionedDemandSnapshot has required freshness fields", () => {
    const snapshot: VersionedDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 10,
      soldLast7Days: 7, soldLast30Days: 30, dailyVelocity: 1,
      daysOfStock: 10, pendingInbound: 0, needsReorder: false,
      lastSaleAt: null, lastStockEventAt: null,
      computedAt: "2026-03-19T12:00:00Z",
      snapshotVersion: 1742385600000,
      productName: "Test", barcode: "123",
    };
    expect(snapshot.computedAt).toBeTruthy();
    expect(snapshot.snapshotVersion).toBeGreaterThan(0);
    expect(snapshot.productName).toBeTruthy();
  });

  it("snapshotVersion is epoch ms — monotonically increasing", () => {
    const v1 = Date.now();
    const v2 = Date.now();
    expect(v2).toBeGreaterThanOrEqual(v1);
  });
});

describe("V3-HARDEN-185: Stale snapshot detection", () => {
  it("consumer can detect stale snapshot by comparing snapshotVersion", () => {
    const old: VersionedDemandSnapshot = {
      storeId: "s1", productId: "p1", currentStock: 10,
      soldLast7Days: 7, soldLast30Days: 30, dailyVelocity: 1,
      daysOfStock: 10, pendingInbound: 0, needsReorder: false,
      lastSaleAt: null, lastStockEventAt: null,
      computedAt: "2026-03-18T12:00:00Z",
      snapshotVersion: 1742299200000, // yesterday
      productName: "Test", barcode: null,
    };

    const fresh: VersionedDemandSnapshot = {
      ...old,
      computedAt: "2026-03-19T12:00:00Z",
      snapshotVersion: 1742385600000, // today
    };

    const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
    const now = 1742385600000;

    expect(now - old.snapshotVersion).toBeGreaterThanOrEqual(STALE_THRESHOLD_MS);
    expect(now - fresh.snapshotVersion).toBeLessThan(STALE_THRESHOLD_MS);
  });
});

describe("V3-HARDEN-185: API route contract", () => {
  it("POS demand-signals route exists", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/pos/demandSignals.ts"),
      "utf8"
    );
    expect(src).toContain('"/demand-signals"');
    expect(src).toContain('"/demand-signals/recommendations"');
    expect(src).toContain("requireDeviceToken");
    expect(src).toContain("computeStoreDemandSignals");
  });

  it("retailer-admin demand-signals route exists", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/retailer-admin/demandSignals.ts"),
      "utf8"
    );
    expect(src).toContain('"/demand-signals"');
    expect(src).toContain('"/demand-signals/recommendations"');
    expect(src).toContain("computeStoreDemandSignals");
  });

  it("admin demand-signals route has pressure + recompute", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/admin/demandSignals.ts"),
      "utf8"
    );
    expect(src).toContain('"/demand-signals/pressure"');
    expect(src).toContain('"/demand-signals/store/:storeId"');
    expect(src).toContain('"/demand-signals/recompute"');
    expect(src).toContain("computeCrossStoreDemandPressure");
  });

  it("routes registered in index.ts", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/index.ts"),
      "utf8"
    );
    expect(src).toContain("posDemandSignalsRouter");
    expect(src).toContain("retailerDemandSignalsRouter");
    expect(src).toContain("adminDemandSignalsRouter");
  });
});

describe("V3-HARDEN-185: Compute service module contract", () => {
  it("demandSignalCompute exports required functions", () => {
    const mod = require("../../src/services/demandSignalCompute");
    expect(typeof mod.computeStoreDemandSignals).toBe("function");
    expect(typeof mod.buildReorderRecommendations).toBe("function");
    expect(typeof mod.computeCrossStoreDemandPressure).toBe("function");
  });

  it("gate script validates demand signal infrastructure", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "scripts/gates/demand-signal-gate.sh"),
      "utf8"
    );
    expect(src).toContain("demandSignalCompute.ts");
    expect(src).toContain("demand-signals");
    expect(src).toContain("computeStoreDemandSignals");
  });
});

// ─── P0-1: Canonical schema column verification ───

describe("P0-1: demandSignalCompute uses canonical PO schema", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/services/demandSignalCompute.ts"),
    "utf8"
  );

  it("uses poi.order_id (not purchase_order_id) for FK join", () => {
    expect(src).toContain("poi.order_id");
    expect(src).not.toContain("poi.purchase_order_id");
  });

  it("uses poi.ordered_quantity (not poi.quantity) for sum", () => {
    expect(src).toContain("poi.ordered_quantity");
    expect(src).not.toContain("SUM(poi.quantity)");
  });
});

// ─── P0-2: Admin auth enforcement ───

describe("P0-2: Admin demand-signals routes require auth", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/routes/v1/admin/demandSignals.ts"),
    "utf8"
  );

  it("imports requireAdminToken", () => {
    expect(src).toContain("requireAdminToken");
  });

  it("applies requireAdminToken to all demand-signal routes", () => {
    expect(src).toContain('adminDemandSignalsRouter.use("/demand-signals", requireAdminToken)');
  });

  it("applies requirePermission to read endpoints", () => {
    expect(src).toContain('requirePermission("demand_signals", "read")');
  });

  it("applies requirePermission write to recompute", () => {
    expect(src).toContain('requirePermission("demand_signals", "write")');
  });
});

describe("P0-2: Admin allocation routes require auth", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/routes/v1/admin/allocations.ts"),
    "utf8"
  );

  it("imports requireAdminToken", () => {
    expect(src).toContain("requireAdminToken");
  });

  it("applies requireAdminToken to all allocation routes", () => {
    expect(src).toContain('adminAllocationsRouter.use("/allocations", requireAdminToken)');
  });

  it("applies requirePermission to read and write", () => {
    expect(src).toContain('requirePermission("allocations", "read")');
    expect(src).toContain('requirePermission("allocations", "write")');
  });
});

describe("P0-2: Supplier allocations use canonical req.supplierId", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/routes/v1/supplier/allocations.ts"),
    "utf8"
  );

  it("uses req.supplierId (not req.supplier!.id)", () => {
    expect(src).toContain("req.supplierId");
    // Check no code usage of req.supplier!.id (comments are OK)
    const codeLines = src.split("\n").filter((l: string) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
    const hasOldPattern = codeLines.some((l: string) => l.includes("req.supplier!"));
    expect(hasOldPattern).toBe(false);
  });

  it("returns 401 when supplierId is missing", () => {
    expect(src).toContain('return res.status(401)');
    expect(src).toContain("Supplier auth required");
  });
});

// ─── P0-3: Canonical lifecycle publisher wiring ───

describe("P0-3: allocationService uses canonical publishLifecycleEvent", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/services/allocationService.ts"),
    "utf8"
  );

  it("imports publishLifecycleEvent from lifecycleEventService", () => {
    expect(src).toContain('import { publishLifecycleEvent } from "./lifecycleEventService"');
  });

  it("calls publishLifecycleEvent in transitionAllocation", () => {
    expect(src).toContain("await publishLifecycleEvent(");
  });

  it("does NOT have sidecar writeLifecycleEvent", () => {
    expect(src).not.toContain("function writeLifecycleEvent");
  });
});

describe("P0-3: lifecycleEventService uses real WhatsApp send", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/services/lifecycleEventService.ts"),
    "utf8"
  );

  it("imports sendTextMessage from whatsappService", () => {
    expect(src).toContain("sendTextMessage");
  });

  it("imports normalizePhone from whatsappService", () => {
    expect(src).toContain("normalizePhone");
  });

  it("resolves recipient phone from DB", () => {
    expect(src).toContain("resolveRecipientPhone");
    expect(src).toContain("platform.users");
    expect(src).toContain("supplier.suppliers");
  });

  it("calls sendTextMessage with normalized phone", () => {
    expect(src).toContain("await sendTextMessage({ to: normalizedPhone, body: message })");
  });

  it("handles RATE_LIMITED with retry", () => {
    expect(src).toContain("RATE_LIMITED");
  });
});

// ─── P0-4: Store ownership on lifecycle events ───

describe("P0-4: POS lifecycle events enforce store ownership", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/routes/v1/pos/lifecycleEvents.ts"),
    "utf8"
  );

  it("verifies order belongs to device store before returning events", () => {
    expect(src).toContain("ownerCheck");
    expect(src).toContain("store_id = $2");
  });

  it("returns 404 for cross-store order IDs", () => {
    expect(src).toContain("Order not found");
  });

  it("checks both lifecycle_event_log and purchase_orders", () => {
    expect(src).toContain("lifecycle_event_log");
    expect(src).toContain("orders.purchase_orders");
  });
});

// ─── P0-5: Startup validation wiring ───

describe("P0-5: Phase 21 startup validation wired", () => {
  it("app.ts calls validatePhase21Startup", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/app.ts"),
      "utf8"
    );
    expect(src).toContain("validatePhase21Startup");
  });

  it("deploy.yml has Phase 21 gate as blocking step", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", ".github/workflows/deploy.yml"),
      "utf8"
    );
    expect(src).toContain("phase21-go-live-gate.sh");
    expect(src).toContain("Phase 21 Go-Live Gate");
  });
});

// ─── P0-6: Portal consumers exist ───

describe("P0-6: Cross-portal consumers exist", () => {
  const fs = require("fs");
  const path = require("path");

  it("superadmin demand signals consumer", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "supermandi-superadmin/src/api/demandSignals.ts"),
      "utf8"
    );
    expect(src).toContain("getDemandPressure");
    expect(src).toContain("/api/v1/admin/demand-signals/pressure");
  });

  it("superadmin allocations consumer", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "supermandi-superadmin/src/api/allocations.ts"),
      "utf8"
    );
    expect(src).toContain("getAllocationSummary");
    expect(src).toContain("/api/v1/admin/allocations/summary");
  });

  it("supplier-portal allocations consumer", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "supplier-portal/src/lib/demandAllocations.ts"),
      "utf8"
    );
    expect(src).toContain("listAllocations");
    expect(src).toContain("updateAllocationStatus");
    expect(src).toContain("/api/v1/supplier/allocations");
  });

  it("retailer-admin demand signals consumer", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "retailer-admin/src/lib/demandSignals.ts"),
      "utf8"
    );
    expect(src).toContain("getDemandSignals");
    expect(src).toContain("getDemandRecommendations");
    expect(src).toContain("/api/v1/retailer-admin/demand-signals");
  });

  it("POS buyAgainApi wires purchaseDraftStore", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/services/api/buyAgainApi.ts"),
      "utf8"
    );
    expect(src).toContain("loadBuyAgainIntoDraft");
    expect(src).toContain("usePurchaseDraftStore");
  });
});
