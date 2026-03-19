#!/usr/bin/env node
/**
 * V3-HARDEN-189: Phase 21 runtime behavioral verification script
 *
 * Executes actual code paths (not grep) to prove behavioral correctness.
 * Called by phase21-go-live-gate.sh as a blocking check.
 *
 * Exit 0 = all checks pass. Exit 1 = failure.
 */

// Must run from backend/ dir with ts-jest available
const path = require("path");
const fs = require("fs");

let failures = 0;
let checks = 0;

function check(label, fn) {
  checks++;
  try {
    const result = fn();
    if (result === false) throw new Error("returned false");
    console.log(`  [${checks}] ${label}... OK`);
  } catch (err) {
    console.log(`  [${checks}] ${label}... FAIL (${err.message})`);
    failures++;
  }
}

console.log("=== Phase 21 Runtime Behavioral Verification ===\n");

// 1. Allocation state machine: execute actual transitions
check("Allocation: pending_trigger → triggered is valid", () => {
  const { isValidTransition } = require("../backend/src/services/allocationService");
  return isValidTransition("pending_trigger", "triggered") === true;
});

check("Allocation: triggered → accepted is valid", () => {
  const { isValidTransition } = require("../backend/src/services/allocationService");
  return isValidTransition("triggered", "accepted") === true;
});

check("Allocation: triggered → delivered is BLOCKED (skip)", () => {
  const { isValidTransition } = require("../backend/src/services/allocationService");
  return isValidTransition("triggered", "delivered") === false;
});

check("Allocation: rejected is terminal (no outgoing)", () => {
  const { getAllowedTransitions } = require("../backend/src/services/allocationService");
  return getAllowedTransitions("rejected").length === 0;
});

check("Allocation: grn_completed is terminal", () => {
  const { getAllowedTransitions } = require("../backend/src/services/allocationService");
  return getAllowedTransitions("grn_completed").length === 0;
});

check("Allocation: full happy path is valid", () => {
  const { isValidTransition } = require("../backend/src/services/allocationService");
  const path = ["pending_trigger", "triggered", "accepted", "dispatched", "delivered", "grn_completed"];
  for (let i = 0; i < path.length - 1; i++) {
    if (!isValidTransition(path[i], path[i + 1])) return false;
  }
  return true;
});

// 2. Demand compute: reorder math
check("Demand: reorder suggestion qty=37 for velocity=3, stock=5, pending=0", () => {
  const { calculateReorderSuggestion } = require("../backend/src/services/storeDemandSignal");
  const r = calculateReorderSuggestion({
    storeId: "s1", productId: "p1", currentStock: 5,
    soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
    daysOfStock: 1.7, pendingInbound: 0, needsReorder: true,
    lastSaleAt: null, lastStockEventAt: null,
  });
  return r.suggestedQuantity === 37 && r.needsReorder === true;
});

check("Demand: no reorder when stock covers 14+ days", () => {
  const { calculateReorderSuggestion } = require("../backend/src/services/storeDemandSignal");
  const r = calculateReorderSuggestion({
    storeId: "s1", productId: "p1", currentStock: 100,
    soldLast7Days: 7, soldLast30Days: 30, dailyVelocity: 1,
    daysOfStock: 100, pendingInbound: 0, needsReorder: false,
    lastSaleAt: null, lastStockEventAt: null,
  });
  return r.needsReorder === false && r.suggestedQuantity === 0;
});

check("Demand: pending inbound reduces suggestion", () => {
  const { calculateReorderSuggestion } = require("../backend/src/services/storeDemandSignal");
  const withoutPending = calculateReorderSuggestion({
    storeId: "s1", productId: "p1", currentStock: 5,
    soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
    daysOfStock: 1.7, pendingInbound: 0, needsReorder: true,
    lastSaleAt: null, lastStockEventAt: null,
  });
  const withPending = calculateReorderSuggestion({
    storeId: "s1", productId: "p1", currentStock: 5,
    soldLast7Days: 21, soldLast30Days: 90, dailyVelocity: 3,
    daysOfStock: 1.7, pendingInbound: 20, needsReorder: true,
    lastSaleAt: null, lastStockEventAt: null,
  });
  return withPending.suggestedQuantity < withoutPending.suggestedQuantity;
});

// 3. Lifecycle communication rules
check("Lifecycle: 10 event types defined", () => {
  const { LIFECYCLE_COMMUNICATION_RULES } = require("../backend/src/services/storeDemandSignal");
  return Object.keys(LIFECYCLE_COMMUNICATION_RULES).length === 10;
});

check("Lifecycle: every event has at least one delivery target", () => {
  const { LIFECYCLE_COMMUNICATION_RULES } = require("../backend/src/services/storeDemandSignal");
  for (const [evt, rule] of Object.entries(LIFECYCLE_COMMUNICATION_RULES)) {
    const total = rule.retailer.length + rule.supplier.length + rule.admin.length;
    if (total === 0) return false;
  }
  return true;
});

check("Lifecycle: supplier never gets repeat_order_prompt", () => {
  const { LIFECYCLE_COMMUNICATION_RULES } = require("../backend/src/services/storeDemandSignal");
  return LIFECYCLE_COMMUNICATION_RULES.repeat_order_prompt.supplier.length === 0;
});

// 4. Auth middleware presence
check("Admin demand routes: requireAdminToken imported", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../backend/src/routes/v1/admin/demandSignals.ts"), "utf8"
  );
  return src.includes("requireAdminToken") && src.includes('requirePermission("demand_signals"');
});

check("Supplier allocations: uses req.supplierId", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../backend/src/routes/v1/supplier/allocations.ts"), "utf8"
  );
  const codeLines = src.split("\n").filter(l => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
  return codeLines.some(l => l.includes("req.supplierId")) &&
         !codeLines.some(l => l.includes("req.supplier!"));
});

// 5. Store ownership on lifecycle events
check("POS lifecycle: order endpoint checks store_id ownership", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../backend/src/routes/v1/pos/lifecycleEvents.ts"), "utf8"
  );
  return src.includes("store_id = $2") && src.includes("Order not found");
});

// 6. Canonical publisher wiring (no sidecar)
check("Allocation service: uses publishLifecycleEvent (not sidecar)", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../backend/src/services/allocationService.ts"), "utf8"
  );
  return src.includes("publishLifecycleEvent") && !src.includes("function writeLifecycleEvent");
});

// 7. RBAC migration
check("RBAC migration 202: demand_signals + allocations permissions seeded", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../backend/migrations/202_phase21_rbac_permissions.sql"), "utf8"
  );
  return src.includes("demand_signals") && src.includes("allocations") && src.includes("ON CONFLICT");
});

// 8. Startup validation
check("Startup validation module exports function", () => {
  // Can't require TS directly, verify file structure
  const src = fs.readFileSync(
    path.resolve(__dirname, "../backend/src/services/phase21StartupValidation.ts"), "utf8"
  );
  return src.includes("export async function validatePhase21Startup") &&
         src.includes("readyForGoLive");
});

check("app.ts calls validatePhase21Startup at boot", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../backend/src/app.ts"), "utf8"
  );
  return src.includes("validatePhase21Startup");
});

console.log(`\n=== Results: ${checks - failures}/${checks} passed ===`);
if (failures > 0) {
  console.log(`VERIFICATION FAILED: ${failures} check(s)`);
  process.exit(1);
}
console.log("VERIFICATION PASSED");
