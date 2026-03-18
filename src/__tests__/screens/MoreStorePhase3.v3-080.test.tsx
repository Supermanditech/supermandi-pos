/**
 * V3-FIX-080..084: MORE/Reorder/Stock/Khata/Reports/Settings runtime tests
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const c = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: c, Svg: c, Rect: c, Path: c, Circle: c, Line: c };
});

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#fff", surface: "#f8f", primary: "#2563eb", primaryLight: "#dbeafe",
    textPrimary: "#111", textSecondary: "#4b5", textTertiary: "#9ca",
    border: "#e2e", success: "#16a", error: "#dc2", warning: "#f59",
    warningSoft: "#fef", backgroundSecondary: "#f1f", accent: "#2563eb",
    successSoft: "#dcf", errorSoft: "#fef",
  }),
}));

jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn() } }));
jest.mock("../../services/deviceSession", () => ({ getDeviceStoreId: jest.fn().mockResolvedValue("store-1") }));

// Reorder mocks
jest.mock("../../services/api/reorderApi", () => ({
  listPendingReorders: jest.fn().mockResolvedValue({
    data: [
      { id: "r1", productName: "Parle-G", currentStock: 5, suggestedQuantity: 48, suggestedSupplierName: "Metro" },
    ],
  }),
  getStockDeficit: jest.fn().mockReturnValue(43),
  isCriticallyLow: jest.fn().mockReturnValue(true),
  getEstimatedTotal: jest.fn().mockReturnValue(2400),
  approvePendingReorders: jest.fn().mockResolvedValue({ approved: 1 }),
}));

// Stock mocks
jest.mock("../../services/api/inventoryApi", () => ({
  getStockSummary: jest.fn().mockResolvedValue({ items: [{ name: "Coke", barcode: "123", stock: 10, priceMinor: 2000 }], totalProducts: 1, totalValue: 2000 }),
  getPurchaseHistory: jest.fn().mockResolvedValue({ entries: [] }),
  recordManualInward: jest.fn(),
}));

// Khata mocks
jest.mock("../../stores/khataStore", () => ({
  useKhataStore: (sel: (s: any) => any) => sel({
    customers: [
      { name: "Ramesh", balanceMinor: 320000, lastEntryAt: new Date(Date.now() - 40 * 86400000).toISOString() },
      { name: "Suresh", balanceMinor: 100000, lastEntryAt: new Date(Date.now() - 5 * 86400000).toISOString() },
    ],
    loading: false,
    fetchCustomers: jest.fn(),
  }),
}));
jest.mock("../../services/api/posApi", () => ({ recordCollectionCash: jest.fn().mockResolvedValue({}) }));

// Daily summary mocks
jest.mock("../../services/api/dailySummaryApi", () => ({
  getDailySummary: jest.fn().mockResolvedValue({
    totalSales: 15400, totalBills: 12, yesterdaySales: 13200, yesterdayBills: 10, topItem: "Amul Butter",
    paymentBreakdown: { cash: 8000, upi: 5000, credit: 2400 },
    profit: 2310,
  }),
}));

// Settings mocks
jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: Object.assign(
    (sel: (s: any) => any) => sel({ storeName: "Test Store", storeCode: "TS-001", printerAutoPrint: false, themeMode: "light", soundEnabled: true }),
    { getState: () => ({ storeName: "Test Store", upiVpa: "test@upi", lastSyncAt: new Date(Date.now() - 180000).toISOString() }) },
  ),
}));
jest.mock("../../stores/staffSessionStore", () => ({
  useStaffSessionStore: Object.assign(
    (sel: (s: any) => any) => sel({ session: { name: "Raju", role: "MANAGER" } }),
    { getState: () => ({ session: { name: "Raju", role: "MANAGER" } }) },
  ),
}));
jest.mock("../../services/printerService", () => ({
  printerService: { printReceipt: jest.fn().mockResolvedValue(true), isConnected: () => true, initialize: jest.fn() },
}));
jest.mock("../../services/hidScannerService", () => ({ isHidActive: () => false, setHidScanHandler: jest.fn() }));

// ── Imports ────────────────────────────────────────────────────────────────

import ReorderScreenV3 from "../../screens/v3/ReorderScreenV3";
import MoreScreenV3 from "../../screens/v3/MoreScreenV3";
import KhataScreenV3 from "../../screens/v3/KhataScreenV3";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("V3-FIX-080: Reorder screen", () => {
  it("renders reorder items from real API (not placeholder)", async () => {
    render(<ReorderScreenV3 onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Parle-G")).toBeTruthy();
      expect(screen.getByText(/Order 48/)).toBeTruthy();
    });
  });

  it("has approve, edit, and dismiss actions per item", async () => {
    render(<ReorderScreenV3 onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("✓ Approve")).toBeTruthy();
      expect(screen.getByText("Edit")).toBeTruthy();
      expect(screen.getByText("✕")).toBeTruthy();
    });
  });

  it("approve action calls real API", async () => {
    const mockApprove = require("../../services/api/reorderApi").approvePendingReorders;
    render(<ReorderScreenV3 onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("✓ Approve")).toBeTruthy());
    fireEvent.press(screen.getByText("✓ Approve"));
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith("store-1", ["r1"]));
  });

  it("dismiss removes item from list", async () => {
    render(<ReorderScreenV3 onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("Parle-G")).toBeTruthy());
    fireEvent.press(screen.getByText("✕"));
    expect(screen.queryByText("Parle-G")).toBeNull();
  });
});

describe("V3-FIX-081: MORE hub", () => {
  it("does not hardcode Khata badge=3", async () => {
    render(<MoreScreenV3 onNavigate={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("Khata (Udhar)")).toBeTruthy());
    // Badge with "3" should NOT exist
    expect(screen.queryByText("3")).toBeNull();
  });

  it("renders time-based greeting (not always Good Morning)", () => {
    render(<MoreScreenV3 onNavigate={jest.fn()} />);
    const hour = new Date().getHours();
    const expected = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
    expect(screen.getByText(new RegExp(expected))).toBeTruthy();
  });

  it("renders yesterday data from summary API", async () => {
    render(<MoreScreenV3 onNavigate={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/13,200/)).toBeTruthy(); // yesterdaySales
      expect(screen.getByText("Amul Butter")).toBeTruthy(); // topItem
    });
  });
});

describe("V3-FIX-082: Khata screen", () => {
  it("renders real customer data (no hardcoded Ramesh Kumar demo)", async () => {
    render(<KhataScreenV3 onClose={jest.fn()} />);
    // Real customer from mock store
    await waitFor(() => {
      expect(screen.getByText("Ramesh")).toBeTruthy(); // From real khataStore
      expect(screen.getByText("Suresh")).toBeTruthy();
    });
  });

  it("search filters customer list", async () => {
    render(<KhataScreenV3 onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("Ramesh")).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText("Search customer..."), "Sur");

    await waitFor(() => {
      expect(screen.getByText("Suresh")).toBeTruthy();
      expect(screen.queryByText("Ramesh")).toBeNull();
    });
  });
});
