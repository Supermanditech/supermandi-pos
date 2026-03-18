/**
 * V3-FIX-157 / V3-HARDEN-158 / V3-FIX-160
 * Mounted runtime tests for scan routing behavior
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const mock = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: mock, Svg: mock, Rect: mock, Path: mock, Circle: mock, Line: mock };
});

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, getParent: () => ({ navigate: jest.fn() }) }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d: string) => d || _k }),
}));

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    primary: "#2563EB", primaryLight: "#EFF6FF", background: "#fff", surface: "#fff",
    backgroundSecondary: "#F1F5F9", border: "#E2E8F0", textPrimary: "#0F172A",
    textSecondary: "#475569", textTertiary: "#94A3B8", success: "#16A34A",
    warning: "#F59E0B", error: "#EF4444", warningSoft: "#FEF3C7", successSoft: "#DCFCE7",
  }),
}));

jest.mock("../../theme/responsive", () => ({
  getScreenPadding: () => 16, getGridColumns: () => 3,
  getChipPadding: () => ({ h: 16, v: 8 }), getChipFontSize: () => 12,
}));

jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn() } }));
jest.mock("../../services/hidScannerService", () => ({
  setHidScanHandler: jest.fn(), isHidActive: () => false,
}));

// Cart mock
const mockAddItem = jest.fn();
jest.mock("../../stores/cartStore", () => ({
  useCartStore: Object.assign(
    (sel: (s: any) => any) => sel({
      items: [], addItem: mockAddItem,
    }),
    { getState: () => ({ items: [], addItem: mockAddItem, updateQuantity: jest.fn() }) }
  ),
}));

// Products mock — return a known product for barcode "890100001"
jest.mock("../../stores/productsStore", () => ({
  useProductsStore: Object.assign(
    (sel: (s: any) => any) => sel({
      getProductByBarcode: (barcode: string) => {
        if (barcode === "890100001") return { id: "p1", name: "Maggi", priceMinor: 1400, barcode: "890100001", stock: 50 };
        return undefined;
      },
    }),
    { getState: () => ({}) }
  ),
}));

jest.mock("../../services/cartPayload", () => ({
  buildCartItem: jest.fn((p: any) => ({ id: p.barcode, name: p.name, priceMinor: p.priceMinor, quantity: 1 })),
}));

// Mocks for V3ScreenWrappers imports (all screens except ScanScreenV3 which is tested)
jest.mock("../../screens/v3/PaymentScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/CashScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/UpiScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/UdharScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/SuccessScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/NewProductScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/CompareScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/CounterPurchaseScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/GRNScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/ReorderScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/StockScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/KhataScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/SalesHistoryScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/FinanceScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/ReportsScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/CustomersScreenV3", () => ({ __esModule: true, default: () => null }));
jest.mock("../../screens/v3/SettingsScreenV3", () => ({ __esModule: true, default: () => null }));

import ScanScreenV3 from "../../screens/v3/ScanScreenV3";
import { V3ScanWrapper } from "../../screens/v3/V3ScreenWrappers";
import { resetDuplicateState } from "../../services/scanIntent";

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-157: ScanScreenV3 mounted scan routing
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-157+160: ScanScreenV3 mounted SELL scan (runtime)", () => {
  beforeEach(() => { mockAddItem.mockClear(); resetDuplicateState(); });

  it("renders scan screen in sell mode by default", () => {
    render(<ScanScreenV3 visible={true} onClose={jest.fn()} onProductFound={jest.fn()} onNewProduct={jest.fn()} />);
    expect(screen.getByText("Scan Barcode")).toBeTruthy();
  });

  it("found barcode adds to cart in sell mode", () => {
    const onProductFound = jest.fn();
    render(<ScanScreenV3 visible={true} defaultContext="sell" onClose={jest.fn()} onProductFound={onProductFound} onNewProduct={jest.fn()} />);

    // Type a known barcode
    const input = screen.getByPlaceholderText(/Type barcode/);
    fireEvent.changeText(input, "890100001");
    fireEvent(input, "submitEditing");

    // Product found — addItem called
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(onProductFound).toHaveBeenCalledWith("890100001", "sell");
  });

  it("unknown barcode shows not-found result", () => {
    render(<ScanScreenV3 visible={true} defaultContext="sell" onClose={jest.fn()} onProductFound={jest.fn()} onNewProduct={jest.fn()} />);

    const input = screen.getByPlaceholderText(/Type barcode/);
    fireEvent.changeText(input, "999999999");
    fireEvent(input, "submitEditing");

    // Not found — show result panel
    expect(screen.getByText("Product Not Found")).toBeTruthy();
    expect(screen.getByText("999999999")).toBeTruthy();
    // New Product button should be visible in sell mode
    expect(screen.getByTestId("scan-new-product-btn")).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-157: V3ScanWrapper mounted routing proof
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-157: V3ScanWrapper mounted routing (runtime)", () => {
  beforeEach(() => { resetDuplicateState(); mockNavigate.mockClear(); });

  it("wrapper reads defaultContext param for procurement mode", () => {
    const route = { params: { defaultContext: "procurement" } };
    render(<V3ScanWrapper route={route} />);
    // Should render scan screen (visible=true)
    expect(screen.getByText("Scan Barcode")).toBeTruthy();
  });

  it("procurement found navigates to V3Buy with scannedBarcode", () => {
    const route = { params: { defaultContext: "procurement" } };
    render(<V3ScanWrapper route={route} />);

    // Scan a known barcode
    const input = screen.getByPlaceholderText(/Type barcode/);
    fireEvent.changeText(input, "890100001");
    fireEvent(input, "submitEditing");

    // Procurement success should navigate to V3Buy with barcode param
    expect(mockNavigate).toHaveBeenCalledWith("V3Buy", { scannedBarcode: "890100001" });
  });

  it("sell found does NOT navigate to V3Buy", () => {
    const route = { params: { defaultContext: "sell" } };
    render(<V3ScanWrapper route={route} />);

    const input = screen.getByPlaceholderText(/Type barcode/);
    fireEvent.changeText(input, "890100001");
    fireEvent(input, "submitEditing");

    // SELL success should NOT navigate to V3Buy
    expect(mockNavigate).not.toHaveBeenCalledWith("V3Buy", expect.anything());
  });
});

describe("V3-HARDEN-158: ScanScreenV3 mounted procurement scan (runtime)", () => {
  beforeEach(() => { resetDuplicateState(); });
  it("renders in procurement mode and hides New Product on miss", () => {
    render(<ScanScreenV3 visible={true} defaultContext="procurement" onClose={jest.fn()} onProductFound={jest.fn()} onNewProduct={jest.fn()} />);

    // Scan unknown barcode
    const input = screen.getByPlaceholderText(/Type barcode/);
    fireEvent.changeText(input, "999999999");
    fireEvent(input, "submitEditing");

    // Not found
    expect(screen.getByText("Product Not Found")).toBeTruthy();
    // New Product button MUST NOT appear in procurement mode
    expect(screen.queryByTestId("scan-new-product-btn")).toBeNull();
    // Should show procurement-specific message
    expect(screen.getByText("Product not available in supplier catalogue")).toBeTruthy();
  });
});
