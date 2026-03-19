/**
 * V3-FIX-187: Behavioral tests for allocation state machine
 */

import {
  isValidTransition,
  getAllowedTransitions,
} from "../../src/services/allocationService";
import type { AllocationStatus } from "../../src/services/storeDemandSignal";

describe("V3-FIX-187: Allocation state machine transitions", () => {
  it("pending_trigger can only go to triggered", () => {
    expect(isValidTransition("pending_trigger", "triggered")).toBe(true);
    expect(isValidTransition("pending_trigger", "accepted")).toBe(false);
    expect(isValidTransition("pending_trigger", "rejected")).toBe(false);
    expect(isValidTransition("pending_trigger", "dispatched")).toBe(false);
  });

  it("triggered can go to accepted, partial_accepted, or rejected", () => {
    expect(isValidTransition("triggered", "accepted")).toBe(true);
    expect(isValidTransition("triggered", "partial_accepted")).toBe(true);
    expect(isValidTransition("triggered", "rejected")).toBe(true);
    expect(isValidTransition("triggered", "dispatched")).toBe(false);
  });

  it("accepted can only go to dispatched", () => {
    expect(isValidTransition("accepted", "dispatched")).toBe(true);
    expect(isValidTransition("accepted", "delivered")).toBe(false);
    expect(isValidTransition("accepted", "rejected")).toBe(false);
  });

  it("partial_accepted can only go to dispatched", () => {
    expect(isValidTransition("partial_accepted", "dispatched")).toBe(true);
    expect(isValidTransition("partial_accepted", "delivered")).toBe(false);
  });

  it("dispatched can only go to delivered", () => {
    expect(isValidTransition("dispatched", "delivered")).toBe(true);
    expect(isValidTransition("dispatched", "grn_completed")).toBe(false);
  });

  it("delivered can only go to grn_completed", () => {
    expect(isValidTransition("delivered", "grn_completed")).toBe(true);
    expect(isValidTransition("delivered", "dispatched")).toBe(false);
  });

  it("rejected is terminal — no transitions allowed", () => {
    expect(getAllowedTransitions("rejected")).toEqual([]);
    expect(isValidTransition("rejected", "triggered")).toBe(false);
    expect(isValidTransition("rejected", "accepted")).toBe(false);
  });

  it("grn_completed is terminal — no transitions allowed", () => {
    expect(getAllowedTransitions("grn_completed")).toEqual([]);
    expect(isValidTransition("grn_completed", "delivered")).toBe(false);
  });
});

describe("V3-FIX-187: getAllowedTransitions", () => {
  it("returns correct next states for each status", () => {
    const expected: Record<AllocationStatus, AllocationStatus[]> = {
      pending_trigger: ["triggered"],
      triggered: ["accepted", "partial_accepted", "rejected"],
      accepted: ["dispatched"],
      partial_accepted: ["dispatched"],
      rejected: [],
      dispatched: ["delivered"],
      delivered: ["grn_completed"],
      grn_completed: [],
    };

    for (const [status, allowed] of Object.entries(expected)) {
      expect(getAllowedTransitions(status as AllocationStatus)).toEqual(allowed);
    }
  });
});

describe("V3-FIX-187: Full lifecycle path coverage", () => {
  it("happy path: pending→triggered→accepted→dispatched→delivered→grn_completed", () => {
    const happyPath: AllocationStatus[] = [
      "pending_trigger", "triggered", "accepted", "dispatched", "delivered", "grn_completed"
    ];
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(isValidTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it("partial path: pending→triggered→partial_accepted→dispatched→delivered→grn_completed", () => {
    const partialPath: AllocationStatus[] = [
      "pending_trigger", "triggered", "partial_accepted", "dispatched", "delivered", "grn_completed"
    ];
    for (let i = 0; i < partialPath.length - 1; i++) {
      expect(isValidTransition(partialPath[i], partialPath[i + 1])).toBe(true);
    }
  });

  it("rejection path: pending→triggered→rejected (terminal)", () => {
    expect(isValidTransition("pending_trigger", "triggered")).toBe(true);
    expect(isValidTransition("triggered", "rejected")).toBe(true);
    expect(getAllowedTransitions("rejected")).toEqual([]);
  });
});

describe("V3-FIX-187: Backward/skip transitions blocked", () => {
  it("cannot skip states (triggered → delivered)", () => {
    expect(isValidTransition("triggered", "delivered")).toBe(false);
  });

  it("cannot go backward (delivered → dispatched)", () => {
    expect(isValidTransition("delivered", "dispatched")).toBe(false);
  });

  it("cannot restart (grn_completed → pending_trigger)", () => {
    expect(isValidTransition("grn_completed", "pending_trigger")).toBe(false);
  });

  it("cannot accept after dispatch", () => {
    expect(isValidTransition("dispatched", "accepted")).toBe(false);
  });
});

describe("V3-FIX-187: API route contract", () => {
  it("supplier allocations route exists", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/supplier/allocations.ts"),
      "utf8"
    );
    expect(src).toContain('"/allocations"');
    expect(src).toContain('"/allocations/:id"');
    expect(src).toContain('"/allocations/:id/status"');
    expect(src).toContain("requireSupplierAuth");
    expect(src).toContain("transitionAllocation");
  });

  it("admin allocations route exists", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/admin/allocations.ts"),
      "utf8"
    );
    expect(src).toContain('"/allocations/summary"');
    expect(src).toContain('"/allocations/store/:storeId"');
    expect(src).toContain('"/allocations/:id"');
    expect(src).toContain('"/allocations/:id/status"');
    expect(src).toContain("createAllocation");
    expect(src).toContain("getAllocationSummary");
  });

  it("routes registered in index.ts", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/index.ts"),
      "utf8"
    );
    expect(src).toContain("adminAllocationsRouter");
    expect(src).toContain("supplierAllocationsRouter");
  });
});
