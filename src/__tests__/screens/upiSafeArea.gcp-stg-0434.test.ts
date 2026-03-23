/**
 * GCP-STG-0434: UpiScreenV3 uses safe area insets for paddingTop/paddingBottom
 *
 * BEHAVIORAL test — renders UpiScreenV3 with mocked react-native-safe-area-context
 * and verifies:
 * 1. useSafeAreaInsets is called during render
 * 2. Changing insets.top produces different rendered output (dynamic, not hardcoded)
 * 3. Renders without crashing (smoke test)
 */

// --- Mocks (BEFORE any component imports) ---
// Note: react-native-safe-area-context is mocked via moduleNameMapper in jest.config.js

jest.mock("react-native-qrcode-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: any) => React.createElement("View", { testID: "qr-mock", ...props }),
  };
});

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#fff",
    primary: "#2563EB",
    textPrimary: "#000",
    textTertiary: "#999",
    border: "#ddd",
    surface: "#f5f5f5",
    success: "#22c55e",
    error: "#ef4444",
    warning: "#f59e0b",
    warningSoft: "#fef3c7",
  }),
}));

jest.mock("../../stores/cartStore", () => ({
  useCartStore: Object.assign(
    jest.fn((selector: any) => {
      if (typeof selector === "function") return selector({ items: [{ id: "1", name: "Test", quantity: 1, priceMinor: 1000, barcode: "123" }] });
      return {};
    }),
    { getState: () => ({ lockCart: jest.fn(), unlockCart: jest.fn(), discount: null }) },
  ),
}));

jest.mock("../../services/api/posApi", () => ({
  createSale: jest.fn().mockResolvedValue({ saleId: "sale-1", totals: { totalMinor: 1000 } }),
  initUpiPayment: jest.fn().mockResolvedValue({ paymentId: "pay-1", upiVpa: "test@upi", qrData: "upi://pay", orderId: "ord-1" }),
  confirmUpiPaymentManual: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() } }));

// --- Imports (AFTER mocks) ---
import React from "react";
// @ts-expect-error react-test-renderer has no type declarations
import { create } from "react-test-renderer";

import UpiScreenV3 from "../../screens/v3/UpiScreenV3";

// Get the mock function from the shared mock (moduleNameMapper resolves this)
const { useSafeAreaInsets: mockUseSafeAreaInsets } = require("react-native-safe-area-context");

const defaultProps = {
  onBack: jest.fn(),
  onComplete: jest.fn(),
};

describe("GCP-STG-0434: UpiScreenV3 safe area insets (BEHAVIORAL)", () => {
  beforeEach(() => {
    mockUseSafeAreaInsets.mockClear();
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  test("useSafeAreaInsets is called during render", () => {
    create(React.createElement(UpiScreenV3, defaultProps));
    expect(mockUseSafeAreaInsets).toHaveBeenCalled();
  });

  test("insets.top value flows into rendered output (not hardcoded)", () => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    const tree1 = create(React.createElement(UpiScreenV3, defaultProps));
    const json1 = JSON.stringify(tree1.toJSON());

    mockUseSafeAreaInsets.mockReturnValue({ top: 99, bottom: 34, left: 0, right: 0 });
    const tree2 = create(React.createElement(UpiScreenV3, defaultProps));
    const json2 = JSON.stringify(tree2.toJSON());

    expect(json1).not.toEqual(json2);
  });

  test("renders without crashing (smoke test)", () => {
    const tree = create(React.createElement(UpiScreenV3, defaultProps));
    expect(tree.toJSON()).toBeTruthy();
  });
});
