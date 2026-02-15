// Unit tests for backend/src/services/storeStateMachine.ts (pure functions)
import {
  StoreStatus,
  isValidTransition,
  getValidTransitions,
  meetsRequirements,
  getMissingRequirements,
} from "../src/services/storeStateMachine";

describe("StoreStatus constants", () => {
  it("exports all status values", () => {
    expect(StoreStatus.DRAFT).toBe("DRAFT");
    expect(StoreStatus.ENROLLED).toBe("ENROLLED");
    expect(StoreStatus.KYC_SUBMITTED).toBe("KYC_SUBMITTED");
    expect(StoreStatus.PAYMENTS_SUBMITTED).toBe("PAYMENTS_SUBMITTED");
    expect(StoreStatus.ACTIVE).toBe("ACTIVE");
    expect(StoreStatus.NEEDS_FIX).toBe("NEEDS_FIX");
    expect(StoreStatus.SUSPENDED).toBe("SUSPENDED");
  });
});

describe("isValidTransition", () => {
  it("allows DRAFT -> ENROLLED", () => {
    expect(isValidTransition("DRAFT", "ENROLLED")).toBe(true);
  });

  it("allows ENROLLED -> KYC_SUBMITTED", () => {
    expect(isValidTransition("ENROLLED", "KYC_SUBMITTED")).toBe(true);
  });

  it("allows KYC_SUBMITTED -> PAYMENTS_SUBMITTED", () => {
    expect(isValidTransition("KYC_SUBMITTED", "PAYMENTS_SUBMITTED")).toBe(true);
  });

  it("allows PAYMENTS_SUBMITTED -> ACTIVE", () => {
    expect(isValidTransition("PAYMENTS_SUBMITTED", "ACTIVE")).toBe(true);
  });

  it("allows PAYMENTS_SUBMITTED -> NEEDS_FIX", () => {
    expect(isValidTransition("PAYMENTS_SUBMITTED", "NEEDS_FIX")).toBe(true);
  });

  it("allows KYC_SUBMITTED -> NEEDS_FIX", () => {
    expect(isValidTransition("KYC_SUBMITTED", "NEEDS_FIX")).toBe(true);
  });

  it("allows NEEDS_FIX -> KYC_SUBMITTED", () => {
    expect(isValidTransition("NEEDS_FIX", "KYC_SUBMITTED")).toBe(true);
  });

  it("allows NEEDS_FIX -> PAYMENTS_SUBMITTED", () => {
    expect(isValidTransition("NEEDS_FIX", "PAYMENTS_SUBMITTED")).toBe(true);
  });

  it("allows ACTIVE -> SUSPENDED", () => {
    expect(isValidTransition("ACTIVE", "SUSPENDED")).toBe(true);
  });

  it("allows SUSPENDED -> ACTIVE", () => {
    expect(isValidTransition("SUSPENDED", "ACTIVE")).toBe(true);
  });

  it("allows SUSPENDED -> DRAFT", () => {
    expect(isValidTransition("SUSPENDED", "DRAFT")).toBe(true);
  });

  it("allows any status -> SUSPENDED", () => {
    for (const status of [
      "DRAFT",
      "ENROLLED",
      "KYC_SUBMITTED",
      "PAYMENTS_SUBMITTED",
      "ACTIVE",
      "NEEDS_FIX",
    ] as const) {
      expect(isValidTransition(status, "SUSPENDED")).toBe(true);
    }
  });

  // Invalid transitions
  it("rejects DRAFT -> ACTIVE (must go through enrollment)", () => {
    expect(isValidTransition("DRAFT", "ACTIVE")).toBe(false);
  });

  it("rejects ENROLLED -> ACTIVE (must go through KYC)", () => {
    expect(isValidTransition("ENROLLED", "ACTIVE")).toBe(false);
  });

  it("rejects ACTIVE -> ENROLLED (can only suspend)", () => {
    expect(isValidTransition("ACTIVE", "ENROLLED")).toBe(false);
  });

  it("rejects ACTIVE -> DRAFT", () => {
    expect(isValidTransition("ACTIVE", "DRAFT")).toBe(false);
  });

  // Initial state (null)
  it("allows null -> DRAFT (initial state)", () => {
    expect(isValidTransition(null, "DRAFT")).toBe(true);
  });

  it("rejects null -> ACTIVE", () => {
    expect(isValidTransition(null, "ACTIVE")).toBe(false);
  });

  it("rejects null -> ENROLLED", () => {
    expect(isValidTransition(null, "ENROLLED")).toBe(false);
  });
});

describe("getValidTransitions", () => {
  it("returns ENROLLED and SUSPENDED for DRAFT", () => {
    const transitions = getValidTransitions("DRAFT");
    expect(transitions).toContain("ENROLLED");
    expect(transitions).toContain("SUSPENDED");
    expect(transitions).toHaveLength(2);
  });

  it("returns only SUSPENDED for ACTIVE", () => {
    const transitions = getValidTransitions("ACTIVE");
    expect(transitions).toEqual(["SUSPENDED"]);
  });

  it("returns ACTIVE and DRAFT for SUSPENDED", () => {
    const transitions = getValidTransitions("SUSPENDED");
    expect(transitions).toContain("ACTIVE");
    expect(transitions).toContain("DRAFT");
  });

  it("returns array for NEEDS_FIX", () => {
    const transitions = getValidTransitions("NEEDS_FIX");
    expect(transitions).toContain("KYC_SUBMITTED");
    expect(transitions).toContain("PAYMENTS_SUBMITTED");
    expect(transitions).toContain("SUSPENDED");
  });
});

describe("meetsRequirements", () => {
  const allFlags = {
    device_bound: true,
    kyc_complete: true,
    upi_complete: true,
    admin_approved: true,
  };

  it("ENROLLED requires device_bound", () => {
    expect(meetsRequirements("ENROLLED", { ...allFlags, device_bound: false })).toBe(false);
    expect(meetsRequirements("ENROLLED", { ...allFlags, device_bound: true })).toBe(true);
  });

  it("ACTIVE requires all flags", () => {
    expect(meetsRequirements("ACTIVE", allFlags)).toBe(true);
    expect(meetsRequirements("ACTIVE", { ...allFlags, device_bound: false })).toBe(false);
    expect(meetsRequirements("ACTIVE", { ...allFlags, kyc_complete: false })).toBe(false);
    expect(meetsRequirements("ACTIVE", { ...allFlags, upi_complete: false })).toBe(false);
    expect(meetsRequirements("ACTIVE", { ...allFlags, admin_approved: false })).toBe(false);
  });

  it("DRAFT has no specific requirements", () => {
    const noFlags = {
      device_bound: false,
      kyc_complete: false,
      upi_complete: false,
      admin_approved: false,
    };
    expect(meetsRequirements("DRAFT", noFlags)).toBe(true);
  });

  it("KYC_SUBMITTED has no specific requirements", () => {
    const noFlags = {
      device_bound: false,
      kyc_complete: false,
      upi_complete: false,
      admin_approved: false,
    };
    expect(meetsRequirements("KYC_SUBMITTED", noFlags)).toBe(true);
  });
});

describe("getMissingRequirements", () => {
  it("returns empty array when all requirements met", () => {
    const allFlags = {
      device_bound: true,
      kyc_complete: true,
      upi_complete: true,
      admin_approved: true,
    };
    expect(getMissingRequirements("ACTIVE", allFlags)).toEqual([]);
  });

  it("lists missing requirements for ACTIVE", () => {
    const noFlags = {
      device_bound: false,
      kyc_complete: false,
      upi_complete: false,
      admin_approved: false,
    };
    const missing = getMissingRequirements("ACTIVE", noFlags);
    expect(missing.length).toBe(4);
    expect(missing).toContain("Device must be bound");
    expect(missing).toContain("KYC must be complete");
    expect(missing).toContain("UPI must be set up");
    expect(missing).toContain("Admin must approve");
  });

  it("lists missing requirement for ENROLLED", () => {
    const flags = {
      device_bound: false,
      kyc_complete: false,
      upi_complete: false,
      admin_approved: false,
    };
    const missing = getMissingRequirements("ENROLLED", flags);
    expect(missing).toContain("Device must be bound");
  });

  it("returns empty for statuses with no requirements", () => {
    const noFlags = {
      device_bound: false,
      kyc_complete: false,
      upi_complete: false,
      admin_approved: false,
    };
    expect(getMissingRequirements("DRAFT", noFlags)).toEqual([]);
    expect(getMissingRequirements("SUSPENDED", noFlags)).toEqual([]);
  });
});
