/**
 * GCP-STG-0436: SuccessScreenV3 uses safe area insets for paddingTop/paddingBottom
 *
 * BEHAVIORAL test — renders SuccessScreenV3 with mocked react-native-safe-area-context
 * and verifies:
 * 1. useSafeAreaInsets is called during render
 * 2. Changing insets.top produces different rendered output (dynamic, not hardcoded)
 * 3. Renders without crashing (smoke test)
 */

// --- Mocks (BEFORE any component imports) ---
// Note: react-native-safe-area-context is mocked via moduleNameMapper in jest.config.js

jest.mock("react-native-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: any) => React.createElement("svg", props),
    Path: (props: any) => React.createElement("path", props),
  };
});

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("../../components/v3/Confetti", () => {
  const React = require("react");
  return { __esModule: true, default: () => React.createElement("View", { testID: "confetti-mock" }) };
});

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#fff",
    primary: "#2563EB",
    primaryLight: "#dbeafe",
    textPrimary: "#000",
    textSecondary: "#666",
    textTertiary: "#999",
    border: "#ddd",
    surface: "#f5f5f5",
    backgroundSecondary: "#f0f0f0",
    success: "#22c55e",
    successSoft: "#dcfce7",
    error: "#ef4444",
    warning: "#f59e0b",
  }),
}));
jest.mock("../../theme/responsive", () => ({
  getScreenPadding: () => 16,
}));

jest.mock("../../stores/cartStore", () => ({
  useCartStore: Object.assign(
    jest.fn((selector: any) => {
      if (typeof selector === "function") return selector({ items: [], clearCart: jest.fn() });
      return {};
    }),
    { getState: () => ({ clearCart: jest.fn() }) },
  ),
}));

jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: Object.assign(
    jest.fn((selector: any) => {
      if (typeof selector === "function") return selector({ printerAutoPrint: false });
      return {};
    }),
    { getState: () => ({ printerAutoPrint: false }) },
  ),
}));

jest.mock("../../services/printerService", () => ({
  printerService: { printReceipt: jest.fn().mockResolvedValue(true) },
}));

jest.mock("../../services/api/posApi", () => ({
  voidSale: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/billing/billShare", () => ({ shareBillWhatsApp: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() } }));

// --- Imports (AFTER mocks) ---
import React from "react";
// @ts-expect-error react-test-renderer has no type declarations
import { create } from "react-test-renderer";

import SuccessScreenV3 from "../../screens/v3/SuccessScreenV3";

// Get the mock function from the shared mock (moduleNameMapper resolves this)
const { useSafeAreaInsets: mockUseSafeAreaInsets } = require("react-native-safe-area-context");

const defaultProps = {
  paymentMethod: "CASH" as const,
  totalMinor: 5000,
  itemCount: 3,
  saleId: "sale-123",
  onNewSale: jest.fn(),
};

describe("GCP-STG-0436: SuccessScreenV3 safe area insets (BEHAVIORAL)", () => {
  beforeEach(() => {
    mockUseSafeAreaInsets.mockClear();
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  test("useSafeAreaInsets is called during render", () => {
    create(React.createElement(SuccessScreenV3, defaultProps));
    expect(mockUseSafeAreaInsets).toHaveBeenCalled();
  });

  test("insets.top value flows into rendered output (not hardcoded)", () => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    const tree1 = create(React.createElement(SuccessScreenV3, defaultProps));
    const json1 = JSON.stringify(tree1.toJSON());

    mockUseSafeAreaInsets.mockReturnValue({ top: 99, bottom: 34, left: 0, right: 0 });
    const tree2 = create(React.createElement(SuccessScreenV3, defaultProps));
    const json2 = JSON.stringify(tree2.toJSON());

    expect(json1).not.toEqual(json2);
  });

  test("renders without crashing (smoke test)", () => {
    const tree = create(React.createElement(SuccessScreenV3, defaultProps));
    expect(tree.toJSON()).toBeTruthy();
  });
});
