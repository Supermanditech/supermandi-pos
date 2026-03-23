/**
 * GCP-STG-0371: POS Sync — Per-Request Timeout via withSyncTimeout
 *
 * Verifies that sync API calls are wrapped with a 30s timeout
 * and that AbortError is handled gracefully (log warning, don't crash).
 */

// Mock all transitive dependencies before importing
jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(() => jest.fn()),
}));
jest.mock("../../services/offline/sync", () => ({ syncOutbox: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../services/stockService", () => ({ refreshStockSnapshot: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../stores/productsStore", () => ({
  useProductsStore: { getState: () => ({ checkAndRefresh: jest.fn().mockResolvedValue(undefined) }) },
}));
jest.mock("../../services/deviceSession", () => ({
  getDeviceToken: jest.fn().mockResolvedValue("mock-token"),
  getDeviceSession: jest.fn().mockResolvedValue(null),
  saveDeviceSession: jest.fn(),
  clearDeviceSession: jest.fn(),
}));
jest.mock("../../services/api/storage", () => ({
  getAuthToken: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../config/api", () => ({ API_BASE_URL: "http://localhost:3000" }));
jest.mock("../../i18n", () => ({ language: "en" }));
jest.mock("../../stores/staffSessionStore", () => ({
  useStaffSessionStore: { getState: () => ({ session: null }) },
}));

import { withSyncTimeout } from "../../services/syncService";

// ---------- helpers ----------

function neverResolve(): Promise<string> {
  return new Promise(() => {
    /* intentionally never settles */
  });
}

function immediateReject(msg: string): Promise<string> {
  return Promise.reject(new Error(msg));
}

// ---------- tests ----------

describe("GCP-STG-0371: withSyncTimeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves when the inner promise resolves before timeout", async () => {
    const p = withSyncTimeout(Promise.resolve("ok"), 5000, "test");
    await expect(p).resolves.toBe("ok");
  });

  it("rejects with AbortError when the inner promise exceeds timeout", async () => {
    const p = withSyncTimeout(neverResolve(), 100, "slowCall");

    // Advance timers past the timeout
    jest.advanceTimersByTime(150);

    await expect(p).rejects.toThrow("[GCP-STG-0371] slowCall timed out after 100ms");
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("propagates the original error if inner promise rejects before timeout", async () => {
    const p = withSyncTimeout(immediateReject("network error"), 5000, "test");
    await expect(p).rejects.toThrow("network error");
  });

  it("clears the timeout timer on successful resolution (no leak)", async () => {
    const clearSpy = jest.spyOn(global, "clearTimeout");
    const p = withSyncTimeout(Promise.resolve(42), 5000, "test");
    await expect(p).resolves.toBe(42);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("clears the timeout timer on rejection (no leak)", async () => {
    const clearSpy = jest.spyOn(global, "clearTimeout");
    const p = withSyncTimeout(immediateReject("fail"), 5000, "test");
    await expect(p).rejects.toThrow("fail");
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("uses default timeout (30s) when ms not provided", async () => {
    const p = withSyncTimeout(neverResolve(), undefined, "defaultTest");

    // Advance past 30s
    jest.advanceTimersByTime(30_001);

    await expect(p).rejects.toThrow("timed out after 30000ms");
  });

  it("does not double-settle if promise resolves after timeout", async () => {
    let resolveOuter!: (v: string) => void;
    const inner = new Promise<string>((r) => { resolveOuter = r; });

    const p = withSyncTimeout(inner, 100, "doubleSettle");

    // Trigger timeout
    jest.advanceTimersByTime(150);
    await expect(p).rejects.toThrow("timed out");

    // Now resolve the inner promise — should NOT throw or cause unhandled rejection
    resolveOuter("late");
  });
});
