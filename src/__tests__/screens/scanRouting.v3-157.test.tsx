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

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
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

import ScanScreenV3 from "../../screens/v3/ScanScreenV3";
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
