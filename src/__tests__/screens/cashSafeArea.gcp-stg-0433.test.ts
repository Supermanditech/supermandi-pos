/**
 * GCP-STG-0433: CashScreenV3 uses safe area insets for paddingTop + paddingBottom
 *
 * BEHAVIORAL test — renders CashScreenV3 with mocked react-native-safe-area-context
 * (via moduleNameMapper) and verifies:
 * 1. useSafeAreaInsets is called during render
 * 2. Changing insets.top produces different rendered output (dynamic, not hardcoded)
 *
 * Zero fs.readFileSync usage — purely runtime behavioral verification.
 */

// --- Mocks (BEFORE any component imports) ---

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#fff",
    surface: "#f9f9f9",
    text: "#000",
    primary: "#2563EB",
    primaryLight: "#DBEAFE",
    card: "#f5f5f5",
    border: "#ddd",
    textPrimary: "#111",
    textSecondary: "#666",
    textTertiary: "#999",
    success: "#22c55e",
    error: "#ef4444",
    backgroundSecondary: "#f0f0f0",
  }),
}));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/api/posApi", () => ({
  createSale: jest.fn().mockResolvedValue({ saleId: "sale-1" }),
  recordCashPayment: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../stores/cartStore", () => {
  const fn = jest.fn((selector: any) => {
    if (typeof selector === "function") {
      return selector({
        items: [{ id: "p1", name: "Test", quantity: 1, priceMinor: 5000, barcode: "123" }],
        total: 5000,
        sellMode: "retail",
        discount: null,
        applyDiscount: jest.fn(),
        lockCart: jest.fn(),
        unlockCart: jest.fn(),
      });
    }
    return {};
  });
  (fn as any).getState = () => ({
    discount: null,
    applyDiscount: jest.fn(),
    lockCart: jest.fn(),
    unlockCart: jest.fn(),
  });
  return { useCartStore: fn };
});
jest.mock("../../screens/v3/usePaymentFlow", () => ({
  usePaymentFlow: () => ({
    grandTotal: 5000,
    itemCount: 1,
    totalDisplay: "₹50",
    isBulk: false,
    processing: false,
    executePayment: jest.fn(),
  }),
}));

// --- Imports (AFTER mocks) ---

import React from "react";
// @ts-expect-error react-test-renderer has no type declarations
import { create } from "react-test-renderer";

import CashScreenV3 from "../../screens/v3/CashScreenV3";

// Get the mock function from the shared mock (moduleNameMapper resolves this)
const { useSafeAreaInsets: mockUseSafeAreaInsets } = require("react-native-safe-area-context");

const defaultProps = {
  onBack: jest.fn(),
  onComplete: jest.fn(),
};

describe("GCP-STG-0433: CashScreenV3 safe area insets (BEHAVIORAL)", () => {
  beforeEach(() => {
    mockUseSafeAreaInsets.mockClear();
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  test("useSafeAreaInsets is called during render", () => {
    create(React.createElement(CashScreenV3, defaultProps));
    expect(mockUseSafeAreaInsets).toHaveBeenCalled();
  });

  test("insets.top value flows into rendered output (not hardcoded)", () => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    const tree1 = create(React.createElement(CashScreenV3, defaultProps));
    const json1 = JSON.stringify(tree1.toJSON());

    mockUseSafeAreaInsets.mockReturnValue({ top: 99, bottom: 34, left: 0, right: 0 });
    const tree2 = create(React.createElement(CashScreenV3, defaultProps));
    const json2 = JSON.stringify(tree2.toJSON());

    // If the component uses insets.top dynamically, the two renders must differ
    expect(json1).not.toEqual(json2);
  });

  test("renders without crashing (smoke test)", () => {
    const tree = create(React.createElement(CashScreenV3, defaultProps));
    expect(tree.toJSON()).toBeTruthy();
  });
});
