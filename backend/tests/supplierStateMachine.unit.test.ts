// Unit tests for backend/src/services/supplierStateMachine.ts (pure functions)
import {
  SupplierStatus,
  isValidTransition,
  getValidTransitions,
} from "../src/services/supplierStateMachine";

describe("SupplierStatus constants", () => {
  it("exports all status values", () => {
    expect(SupplierStatus.KYC_SUBMITTED).toBe("KYC_SUBMITTED");
    expect(SupplierStatus.ACTIVE).toBe("ACTIVE");
    expect(SupplierStatus.NEEDS_FIX).toBe("NEEDS_FIX");
    expect(SupplierStatus.SUSPENDED).toBe("SUSPENDED");
  });
});

describe("isValidTransition", () => {
  // Valid transitions
  it("allows KYC_SUBMITTED -> ACTIVE", () => {
    expect(isValidTransition("KYC_SUBMITTED", "ACTIVE")).toBe(true);
  });

  it("allows KYC_SUBMITTED -> NEEDS_FIX", () => {
    expect(isValidTransition("KYC_SUBMITTED", "NEEDS_FIX")).toBe(true);
  });

  it("allows KYC_SUBMITTED -> SUSPENDED", () => {
    expect(isValidTransition("KYC_SUBMITTED", "SUSPENDED")).toBe(true);
  });

  it("allows ACTIVE -> SUSPENDED", () => {
    expect(isValidTransition("ACTIVE", "SUSPENDED")).toBe(true);
  });

  it("allows NEEDS_FIX -> KYC_SUBMITTED", () => {
    expect(isValidTransition("NEEDS_FIX", "KYC_SUBMITTED")).toBe(true);
  });

  it("allows NEEDS_FIX -> SUSPENDED", () => {
    expect(isValidTransition("NEEDS_FIX", "SUSPENDED")).toBe(true);
  });

  it("allows SUSPENDED -> ACTIVE (reactivation)", () => {
    expect(isValidTransition("SUSPENDED", "ACTIVE")).toBe(true);
  });

  // Invalid transitions
  it("rejects ACTIVE -> KYC_SUBMITTED", () => {
    expect(isValidTransition("ACTIVE", "KYC_SUBMITTED")).toBe(false);
  });

  it("rejects ACTIVE -> NEEDS_FIX", () => {
    expect(isValidTransition("ACTIVE", "NEEDS_FIX")).toBe(false);
  });

  it("rejects SUSPENDED -> KYC_SUBMITTED", () => {
    expect(isValidTransition("SUSPENDED", "KYC_SUBMITTED")).toBe(false);
  });

  it("rejects SUSPENDED -> NEEDS_FIX", () => {
    expect(isValidTransition("SUSPENDED", "NEEDS_FIX")).toBe(false);
  });

  // Initial state (null)
  it("allows null -> KYC_SUBMITTED (initial state)", () => {
    expect(isValidTransition(null, "KYC_SUBMITTED")).toBe(true);
  });

  it("rejects null -> ACTIVE", () => {
    expect(isValidTransition(null, "ACTIVE")).toBe(false);
  });

  it("rejects null -> NEEDS_FIX", () => {
    expect(isValidTransition(null, "NEEDS_FIX")).toBe(false);
  });

  it("rejects null -> SUSPENDED", () => {
    expect(isValidTransition(null, "SUSPENDED")).toBe(false);
  });
});

describe("getValidTransitions", () => {
  it("returns ACTIVE, NEEDS_FIX, SUSPENDED for KYC_SUBMITTED", () => {
    const transitions = getValidTransitions("KYC_SUBMITTED");
    expect(transitions).toContain("ACTIVE");
    expect(transitions).toContain("NEEDS_FIX");
    expect(transitions).toContain("SUSPENDED");
    expect(transitions).toHaveLength(3);
  });

  it("returns only SUSPENDED for ACTIVE", () => {
    const transitions = getValidTransitions("ACTIVE");
    expect(transitions).toEqual(["SUSPENDED"]);
  });

  it("returns KYC_SUBMITTED and SUSPENDED for NEEDS_FIX", () => {
    const transitions = getValidTransitions("NEEDS_FIX");
    expect(transitions).toContain("KYC_SUBMITTED");
    expect(transitions).toContain("SUSPENDED");
    expect(transitions).toHaveLength(2);
  });

  it("returns only ACTIVE for SUSPENDED", () => {
    const transitions = getValidTransitions("SUSPENDED");
    expect(transitions).toEqual(["ACTIVE"]);
  });
});
