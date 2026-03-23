// GCP-STG-0376: Draft PO Auto-Submit — Reorder-created POs use 'submitted' status
// and trigger supplier notification via lifecycle event
// Covers BOTH approve and auto-approve endpoints

import * as fs from "fs";
import * as path from "path";

const reorderPath = path.resolve(__dirname, "../src/routes/v1/reorder.ts");
const reorderCode = fs.readFileSync(reorderPath, "utf-8");

describe("GCP-STG-0376: Reorder PO auto-submit", () => {
  test("no INSERT into purchase_orders uses status 'draft'", () => {
    // All INSERT INTO orders.purchase_orders must use 'submitted', never 'draft'
    const allInserts = [...reorderCode.matchAll(
      /INSERT INTO orders\.purchase_orders[\s\S]*?VALUES[\s\S]*?'(draft|submitted)'/g
    )];
    expect(allInserts.length).toBeGreaterThanOrEqual(2); // approve + auto-approve
    for (const match of allInserts) {
      expect(match[1]).toBe("submitted");
    }
  });

  test("imports publishLifecycleEvent from lifecycleEventService", () => {
    expect(reorderCode).toContain("import { publishLifecycleEvent }");
    expect(reorderCode).toContain("lifecycleEventService");
  });

  test("fires supplier_action_required lifecycle event after each COMMIT", () => {
    // Find all COMMIT + publishLifecycleEvent pairs in the approve/auto-approve sections
    const commitPositions = [...reorderCode.matchAll(/await client\.query\("COMMIT"\)/g)].map(m => m.index!);
    const notifyPositions = [...reorderCode.matchAll(/publishLifecycleEvent\(\{/g)].map(m => m.index!);

    // At least 2 COMMITs and 2 notification blocks (approve + auto-approve)
    expect(commitPositions.length).toBeGreaterThanOrEqual(2);
    expect(notifyPositions.length).toBeGreaterThanOrEqual(2);

    // Each COMMIT should have a publishLifecycleEvent after it (before the next COMMIT)
    for (const commitPos of commitPositions) {
      const nextNotify = notifyPositions.find(n => n > commitPos);
      expect(nextNotify).toBeDefined();
    }
  });

  test("lifecycle events use eventType 'supplier_action_required'", () => {
    const matches = reorderCode.match(/eventType: "supplier_action_required"/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test("lifecycle events include reorder_auto_submit source", () => {
    const matches = reorderCode.match(/source: "reorder_auto_submit"/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test("notification errors are caught (fire-and-forget pattern)", () => {
    const matches = reorderCode.match(/\[GCP-STG-0376\].*notification failed/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test("approve response uses submittedPurchaseOrders key", () => {
    expect(reorderCode).toContain("submittedPurchaseOrders: draftPurchaseOrders");
  });

  test("approve response message says 'submitted' not 'draft'", () => {
    expect(reorderCode).toContain("submitted purchase orders");
  });
});
