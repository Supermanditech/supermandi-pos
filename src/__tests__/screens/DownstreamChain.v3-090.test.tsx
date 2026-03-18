/**
 * V3-HARDEN-090: Downstream chain regression — proves cleanup didn't break flows
 * V3-DELETE-085/086/087 verification + V3-HARDEN-088 state persistence
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const c = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: c, Svg: c, Rect: c, Path: c, Circle: c, Line: c };
});
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d ?? _k }) }));
jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#fff", surface: "#f8f", primary: "#26e", primaryLight: "#dbe",
    textPrimary: "#111", textSecondary: "#4b5", textTertiary: "#9ca",
    border: "#e2e", success: "#16a", error: "#dc2", warning: "#f59",
    warningSoft: "#fef", backgroundSecondary: "#f1f", accent: "#26e",
    successSoft: "#dcf", errorSoft: "#fef",
  }),
}));
jest.mock("../../config/api", () => ({ API_BASE_URL: "http://test", BUILD_INFO: { gitSha: "test" } }));
jest.mock("../../services/api/apiClient", () => ({ apiClient: { get: jest.fn().mockResolvedValue({}), post: jest.fn().mockResolvedValue({}) } }));
jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn() } }));
jest.mock("../../services/deviceSession", () => ({ getDeviceStoreId: jest.fn().mockResolvedValue("store-1") }));
jest.mock("../../services/api/staffApi", () => ({ staffLogin: jest.fn(), staffMe: jest.fn() }));

// Store mocks
jest.mock("../../stores/customerStore", () => ({
  useCustomerStore: (sel: (s: any) => any) => sel({ customers: [], loading: false, fetchCustomers: jest.fn().mockResolvedValue([]) }),
}));
jest.mock("../../stores/khataStore", () => ({
  useKhataStore: (sel: (s: any) => any) => sel({ customers: [], loading: false, fetchCustomers: jest.fn() }),
}));
jest.mock("../../services/api/posApi", () => ({ recordCollectionCash: jest.fn() }));
jest.mock("../../services/api/dailySummaryApi", () => ({ getDailySummary: jest.fn().mockResolvedValue({ totalSales: 0, totalBills: 0 }) }));
jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: Object.assign(
    (sel: (s: any) => any) => sel({ storeName: "Test", printerAutoPrint: false, themeMode: "light", soundEnabled: true }),
    { getState: () => ({ storeName: "Test" }) },
  ),
}));
jest.mock("../../stores/staffSessionStore", () => ({
  useStaffSessionStore: Object.assign(
    (sel: (s: any) => any) => sel({ session: null }),
    { getState: () => ({ session: null }) },
  ),
}));
jest.mock("../../services/printerService", () => ({ printerService: { printReceipt: jest.fn(), isConnected: () => false, initialize: jest.fn() } }));
jest.mock("../../services/hidScannerService", () => ({ isHidActive: () => false, setHidScanHandler: jest.fn() }));
jest.mock("../../services/api/inventoryApi", () => ({ getStockStatement: jest.fn().mockResolvedValue({ data: [] }), getPurchaseHistory: jest.fn().mockResolvedValue({ entries: [] }), recordManualInward: jest.fn() }));
jest.mock("../../services/api/reorderApi", () => ({
  listPendingReorders: jest.fn().mockResolvedValue({ data: [] }),
  getStockDeficit: jest.fn().mockReturnValue(0),
  isCriticallyLow: jest.fn().mockReturnValue(false),
  getEstimatedTotal: jest.fn().mockReturnValue(0),
  approvePendingReorders: jest.fn(),
}));

// ── Imports ────────────────────────────────────────────────────────────────

import CustomersScreenV3 from "../../screens/v3/CustomersScreenV3";
import FinanceScreenV3 from "../../screens/v3/FinanceScreenV3";
import NewProductScreenV3 from "../../screens/v3/NewProductScreenV3";

// ── V3-DELETE-086: Demo data removal verification ──────────────────────────

describe("V3-DELETE-086: No demo data in production paths", () => {
  it("CustomersScreenV3 shows empty state when no real customers (no Ramesh Kumar demo)", async () => {
    render(<CustomersScreenV3 onClose={jest.fn()} />);
    await waitFor(() => {
      // Should show empty state, NOT demo customers
      expect(screen.queryByText("Ramesh Kumar")).toBeNull();
      expect(screen.queryByText("Suresh Patel")).toBeNull();
      expect(screen.queryByText("Mohan Singh")).toBeNull();
    });
  });

  it("NewProductScreenV3 does not show 'Photo — coming soon' placeholder", async () => {
    render(<NewProductScreenV3 barcode="1234567890" onClose={jest.fn()} onProductAdded={jest.fn()} />);
    await waitFor(() => {
      expect(screen.queryByText("Photo — coming soon")).toBeNull();
    });
  });
});

// ── V3-DELETE-087: Dead actions removal verification ───────────────────────

describe("V3-DELETE-087: No placeholder alert actions", () => {
  it("FinanceScreenV3 does not have 'will be available in the next update' alert", () => {
    // Read source to confirm no placeholder alert text
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../screens/v3/FinanceScreenV3.tsx"), "utf8"
    );
    expect(src).not.toContain("will be available in the next update");
    expect(src).not.toContain("Finbox Bill Discounting");
  });
});

// ── V3-HARDEN-088: State persistence verification ──────────────────────────

describe("V3-HARDEN-088: Cart state persistence", () => {
  it("cart store lockCart/unlockCart are called symmetrically in UPI flow", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../screens/v3/UpiScreenV3.tsx"), "utf8"
    );
    // Use word-boundary match to avoid unlockCart matching lockCart
    const lockCalls = (src.match(/\.lockCart\(\)/g) || []).length;
    const unlockCalls = (src.match(/\.unlockCart\(\)/g) || []).length;
    // Every lock must have at least one unlock path
    expect(lockCalls).toBeGreaterThan(0);
    expect(unlockCalls).toBeGreaterThanOrEqual(lockCalls);
  });

  it("success screen clears cart on new sale", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../screens/v3/V3ScreenWrappers.tsx"), "utf8"
    );
    expect(src).toContain("clearCart");
    expect(src).toContain("SellScan");
  });
});

// ── V3-HARDEN-089: Idempotency guards ──────────────────────────────────────

describe("V3-HARDEN-089: Double-submit guards", () => {
  it("ReorderScreenV3 has approving guard on approve-all", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../screens/v3/ReorderScreenV3.tsx"), "utf8"
    );
    expect(src).toContain("approving");
    expect(src).toContain("setApproving(true)");
    expect(src).toContain("setApproving(false)");
  });

  it("usePaymentFlow has createSaleInFlight guard", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../screens/v3/usePaymentFlow.ts"), "utf8"
    );
    expect(src).toContain("createSaleInFlight");
  });

  it("UpiScreenV3 does not auto-confirm (separate init and confirm)", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../screens/v3/UpiScreenV3.tsx"), "utf8"
    );
    // The initFlow useEffect should NOT call confirmUpiPaymentManual
    // Extract the useEffect body (between "const initFlow" and "handleConfirm")
    const initFlowMatch = src.match(/const initFlow = async[\s\S]*?void initFlow/);
    expect(initFlowMatch).toBeTruthy();
    expect(initFlowMatch![0]).not.toContain("confirmUpiPaymentManual");
  });
});
