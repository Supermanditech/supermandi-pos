/**
 * GCP-STG-0506: Scan context guard — block scans during payment/modals
 * GCP-STG-0508: Pipeline-level dedup — suppress identical barcode within 500ms
 */

// Mock all heavy dependencies before importing handleScan
jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: "android" },
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("../../services/api/apiClient", () => ({}));
jest.mock("../../services/api/productsApi", () => ({
  lookupStoreProductByScan: jest.fn(),
  lookupStoreProductPreviewByScan: jest.fn(),
  createStoreProductFromScan: jest.fn(),
}));
jest.mock("../../services/api/scanApi", () => ({
  lookupProductByBarcode: jest.fn(),
  resolveScan: jest.fn().mockResolvedValue({ action: "IGNORED" }),
}));
jest.mock("../../services/networkStatus", () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../services/offline/scan", () => ({
  resolveOfflineScan: jest.fn(),
  setLocalPrice: jest.fn(),
  upsertLocalProduct: jest.fn(),
}));
jest.mock("../../stores/cartStore", () => ({
  useCartStore: { getState: () => ({ items: [], addItem: jest.fn() }) },
}));
jest.mock("../../stores/purchaseDraftStore", () => ({
  usePurchaseDraftStore: { getState: () => ({ addOrUpdate: jest.fn() }) },
}));
jest.mock("../../utils/showToast", () => ({
  showToast: jest.fn(),
}));
jest.mock("../../utils/uiStatus", () => ({
  POS_MESSAGES: {},
}));
jest.mock("../../services/stockService", () => ({
  upsertStockEntries: jest.fn(),
}));

import { onBarcodeScanned, setScanEnabled, isScanEnabled } from "../../services/scan/handleScan";

describe("GCP-STG-0506: Scan context guard", () => {
  beforeEach(() => {
    // Reset scan enabled state before each test
    setScanEnabled(true);
  });

  it("blocks scans when scanEnabled is false", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    setScanEnabled(false);
    expect(isScanEnabled()).toBe(false);

    await onBarcodeScanned("1234567890");

    // Should have logged the block message, NOT scan_barcode_received
    const blocked = logSpy.mock.calls.some(
      (c) => typeof c[0] === "string" && c[0].includes("scan_blocked:payment_or_modal_active")
    );
    expect(blocked).toBe(true);

    const received = logSpy.mock.calls.some(
      (c) => typeof c[0] === "string" && c[0].includes("scan_barcode_received")
    );
    expect(received).toBe(false);

    logSpy.mockRestore();
  });

  it("allows scans when scanEnabled is true", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    setScanEnabled(true);
    expect(isScanEnabled()).toBe(true);

    await onBarcodeScanned("1234567890");

    const received = logSpy.mock.calls.some(
      (c) => typeof c[0] === "string" && c[0].includes("scan_barcode_received")
    );
    expect(received).toBe(true);

    logSpy.mockRestore();
  });

  it("re-enables scans after setScanEnabled(true)", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    setScanEnabled(false);
    await onBarcodeScanned("1111111111");

    const blockedCalls = logSpy.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("scan_blocked")
    );
    expect(blockedCalls.length).toBe(1);

    // Re-enable
    setScanEnabled(true);
    await onBarcodeScanned("2222222222");

    const received = logSpy.mock.calls.some(
      (c) => typeof c[0] === "string" && c[0].includes("scan_barcode_received:2222222222")
    );
    expect(received).toBe(true);

    logSpy.mockRestore();
  });
});

describe("GCP-STG-0508: Pipeline-level dedup", () => {
  beforeEach(() => {
    setScanEnabled(true);
  });

  it("suppresses same barcode within 500ms", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    // First scan should go through
    await onBarcodeScanned("DEDUP123");
    const firstReceived = logSpy.mock.calls.some(
      (c) => typeof c[0] === "string" && c[0].includes("scan_barcode_received:DEDUP123")
    );
    expect(firstReceived).toBe(true);

    // Second identical scan within 500ms should be deduped
    await onBarcodeScanned("DEDUP123");
    const deduped = logSpy.mock.calls.some(
      (c) => typeof c[0] === "string" && c[0].includes("scan_pipeline_dedup:DEDUP123")
    );
    expect(deduped).toBe(true);

    logSpy.mockRestore();
  });

  it("allows different barcodes in rapid succession", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await onBarcodeScanned("BARCODE_A1");
    await onBarcodeScanned("BARCODE_B2");

    const receivedA = logSpy.mock.calls.some(
      (c) => typeof c[0] === "string" && c[0].includes("scan_barcode_received:BARCODE_A1")
    );
    const receivedB = logSpy.mock.calls.some(
      (c) => typeof c[0] === "string" && c[0].includes("scan_barcode_received:BARCODE_B2")
    );
    expect(receivedA).toBe(true);
    expect(receivedB).toBe(true);

    logSpy.mockRestore();
  });

  it("allows same barcode after 500ms window", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    // Mock Date.now to control timing
    const realNow = Date.now;
    let mockTime = realNow();
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);

    await onBarcodeScanned("TIMED999");
    const firstReceived = logSpy.mock.calls.some(
      (c) => typeof c[0] === "string" && c[0].includes("scan_barcode_received:TIMED999")
    );
    expect(firstReceived).toBe(true);

    // Advance time past dedup window
    mockTime += 600;
    await onBarcodeScanned("TIMED999");

    // Count how many times scan_barcode_received:TIMED999 appears
    const receivedCount = logSpy.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("scan_barcode_received:TIMED999")
    ).length;
    expect(receivedCount).toBe(2);

    jest.spyOn(Date, "now").mockRestore();
    logSpy.mockRestore();
  });
});
