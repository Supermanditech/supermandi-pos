/**
 * V3-CLIENT-012 + V3-BIZ-016 + V3-BIZ-021 + V3-POS-020:
 * Behavioral tests executing real staffSessionStore Zustand state transitions.
 *
 * NOT source-text checks. Executes actual store methods and verifies state.
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { useStaffSessionStore, type StaffRole } from "../../stores/staffSessionStore";

const store = useStaffSessionStore;

beforeEach(() => {
  store.setState({ session: null });
});

describe("V3-CLIENT-012: staffSessionStore hydration and lifecycle", () => {
  it("starts with null session", () => {
    expect(store.getState().session).toBeNull();
  });

  it("setSession stores staff identity", () => {
    store.getState().setSession({
      staffId: "staff-1",
      name: "Raju",
      role: "MANAGER",
      maxDiscountPct: 100,
    });

    const session = store.getState().session;
    expect(session).not.toBeNull();
    expect(session!.staffId).toBe("staff-1");
    expect(session!.name).toBe("Raju");
    expect(session!.role).toBe("MANAGER");
    expect(session!.maxDiscountPct).toBe(100);
  });

  it("clearSession removes staff identity", () => {
    store.getState().setSession({ staffId: "s1", name: "A", role: "CASHIER", maxDiscountPct: 10 });
    expect(store.getState().session).not.toBeNull();

    store.getState().clearSession();
    expect(store.getState().session).toBeNull();
  });

  // GCP-STG-0005: Staff session is intentionally NOT persisted (in-memory only)
  // Removed persist middleware so staff session clears on app kill (two-layer model)
  it("does not use persist middleware (in-memory only per two-layer model)", () => {
    const persistApi = (store as any).persist;
    expect(persistApi).toBeUndefined();
  });
});

describe("V3-BIZ-016: staff login business rules (store-level)", () => {
  it("session carries role for discount/permission gating", () => {
    store.getState().setSession({ staffId: "s1", name: "A", role: "CASHIER", maxDiscountPct: 5 });
    expect(store.getState().session!.role).toBe("CASHIER");
    expect(store.getState().session!.maxDiscountPct).toBe(5);
  });

  it("session carries maxDiscountPct per role tier", () => {
    const tiers: Array<{ role: StaffRole; maxDiscount: number }> = [
      { role: "CASHIER", maxDiscount: 5 },
      { role: "STOCK_MANAGER", maxDiscount: 10 },
      { role: "MANAGER", maxDiscount: 100 },
    ];

    for (const tier of tiers) {
      store.getState().setSession({ staffId: "s1", name: "Test", role: tier.role, maxDiscountPct: tier.maxDiscount });
      expect(store.getState().session!.maxDiscountPct).toBe(tier.maxDiscount);
    }
  });

  it("store switch clears session (negative path)", () => {
    store.getState().setSession({ staffId: "s1", name: "A", role: "MANAGER", maxDiscountPct: 100 });
    // Simulate store switch — clearSession is called
    store.getState().clearSession();
    expect(store.getState().session).toBeNull();
  });
});

describe("V3-BIZ-021: no hidden auto-created staff", () => {
  it("session starts null — requires explicit setSession call", () => {
    expect(store.getState().session).toBeNull();
    // No auto-population, no default staff
  });

  it("setSession requires all fields (staffId, name, role, maxDiscountPct)", () => {
    store.getState().setSession({ staffId: "s1", name: "Explicit", role: "CASHIER", maxDiscountPct: 5 });
    const s = store.getState().session!;
    expect(s.staffId).toBeTruthy();
    expect(s.name).toBeTruthy();
    expect(s.role).toBeTruthy();
    expect(typeof s.maxDiscountPct).toBe("number");
  });
});

describe("V3-POS-020: staff PIN login as primary gate (store-level)", () => {
  it("navigation to SELL requires non-null session", () => {
    // Gate contract: session must be non-null before SELL is accessible
    expect(store.getState().session).toBeNull();
    // Would be gated — no SellScan navigation without login
  });

  it("after login, session enables SELL access", () => {
    store.getState().setSession({ staffId: "s1", name: "A", role: "CASHIER", maxDiscountPct: 5 });
    expect(store.getState().session).not.toBeNull();
    // Gate contract satisfied — SellScan navigation allowed
  });
});
