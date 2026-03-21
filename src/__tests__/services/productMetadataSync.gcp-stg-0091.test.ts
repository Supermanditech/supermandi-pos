// GCP-STG-0091: Product metadata sync — behavioral tests
// Verifies the sync pipeline is WIRED and ACTIVE (not dead code)

// --- Mock dependencies BEFORE imports ---
let netInfoCallback: ((state: any) => void) | null = null;
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn((cb: any) => { netInfoCallback = cb; return jest.fn(); }),
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));

jest.mock("../../services/networkStatus", () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));

const mockRefreshStock = jest.fn().mockResolvedValue(undefined);
jest.mock("../../services/stockService", () => ({
  refreshStockSnapshot: mockRefreshStock,
  upsertStockFromProducts: jest.fn(),
}));

jest.mock("../../services/offline/sync", () => ({
  syncOutbox: jest.fn().mockResolvedValue(undefined),
}));

const mockCheckAndRefresh = jest.fn().mockResolvedValue(undefined);
jest.mock("../../stores/productsStore", () => ({
  useProductsStore: {
    getState: () => ({
      checkAndRefresh: mockCheckAndRefresh,
    }),
  },
}));

import * as fs from "fs";
import * as path from "path";

const syncServicePath = path.resolve(__dirname, "../../services/syncService.ts");
const syncServiceCode = fs.readFileSync(syncServicePath, "utf-8");

describe("GCP-STG-0091: Product metadata sync — structural verification", () => {
  test("syncService imports useProductsStore", () => {
    expect(syncServiceCode).toContain('import { useProductsStore } from "../stores/productsStore"');
  });

  test("stock sync interval calls checkAndRefresh()", () => {
    expect(syncServiceCode).toContain("useProductsStore.getState().checkAndRefresh()");
  });

  test("syncNow() also calls checkAndRefresh()", () => {
    const syncNowSection = syncServiceCode.slice(
      syncServiceCode.indexOf("async function syncNow") || syncServiceCode.indexOf("export async function syncNow"),
      syncServiceCode.indexOf("export function onReconnect")
    );
    expect(syncNowSection).toContain("checkAndRefresh()");
  });

  test("syncService.startAutoSync is imported in SplashScreenV3", () => {
    const splashPath = path.resolve(__dirname, "../../screens/v3/SplashScreenV3.tsx");
    const splashCode = fs.readFileSync(splashPath, "utf-8");
    expect(splashCode).toContain('import { startAutoSync } from "../../services/syncService"');
    expect(splashCode).toContain("startAutoSync()");
  });

  test("sync interval is 30 seconds", () => {
    expect(syncServiceCode).toContain("STOCK_SYNC_INTERVAL_MS = 30 * 1000");
  });
});

describe("GCP-STG-0091: Product metadata sync — behavioral", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    // Stop sync to clean up intervals
    const { stopAutoSync } = require("../../services/syncService");
    stopAutoSync();
  });

  test("startAutoSync triggers stock sync + checkAndRefresh after 30s", async () => {
    const { startAutoSync, stopAutoSync } = require("../../services/syncService");

    startAutoSync();

    // Simulate NetInfo reporting connected — this starts the stock sync interval
    if (netInfoCallback) netInfoCallback({ isConnected: true });

    // Advance 30 seconds to trigger the interval
    jest.advanceTimersByTime(30000);

    // Let async ticks resolve (isOnline check + refreshStock + checkAndRefresh)
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockRefreshStock).toHaveBeenCalled();
    expect(mockCheckAndRefresh).toHaveBeenCalled();

    stopAutoSync();
  });

  test("syncNow calls checkAndRefresh immediately", async () => {
    const { syncNow } = require("../../services/syncService");

    await syncNow();

    expect(mockCheckAndRefresh).toHaveBeenCalled();
    expect(mockRefreshStock).toHaveBeenCalled();
  });

  test("checkAndRefresh is NOT called when offline", async () => {
    const { isOnline } = require("../../services/networkStatus");
    (isOnline as jest.Mock).mockResolvedValueOnce(false);

    const { syncNow } = require("../../services/syncService");

    await syncNow();

    // syncNow returns early when offline — checkAndRefresh NOT called
    expect(mockCheckAndRefresh).not.toHaveBeenCalled();
  });
});
