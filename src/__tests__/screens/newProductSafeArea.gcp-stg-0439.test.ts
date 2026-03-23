/**
 * GCP-STG-0439: NewProductScreenV3 uses safe area insets for paddingTop + paddingBottom
 *
 * BEHAVIORAL test — renders NewProductScreenV3 with mocked react-native-safe-area-context
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
    primary: "#2563EB",
    primaryLight: "#DBEAFE",
    border: "#ddd",
    textPrimary: "#111",
    textSecondary: "#666",
    textTertiary: "#999",
    backgroundSecondary: "#f0f0f0",
    success: "#22c55e",
    successSoft: "#f0fdf4",
    error: "#ef4444",
    warning: "#f59e0b",
    warningSoft: "#fefce8",
    disabled: "#d1d5db",
  }),
}));
jest.mock("../../theme/responsive", () => ({ getScreenPadding: () => 16 }));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/offline/scan", () => ({
  upsertLocalProduct: jest.fn().mockResolvedValue(undefined),
  setLocalPrice: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../stores/cartStore", () => {
  const fn = jest.fn((selector: any) => {
    if (typeof selector === "function") {
      return selector({ items: [], total: 0, addItem: jest.fn() });
    }
    return {};
  });
  (fn as any).getState = () => ({ addItem: jest.fn() });
  return { useCartStore: fn };
});
jest.mock("../../services/api/apiClient", () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({ found: false }),
    post: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));
jest.mock("react-native-svg", () => {
  const React = require("react");
  const mock = (name: string) => (props: any) => React.createElement("View", props);
  return { __esModule: true, default: mock("Svg"), Rect: mock("Rect"), Path: mock("Path"), Circle: mock("Circle") };
});

// --- Imports (AFTER mocks) ---

import React from "react";
// @ts-expect-error react-test-renderer has no type declarations
import { create, act } from "react-test-renderer";

import NewProductScreenV3 from "../../screens/v3/NewProductScreenV3";

const { useSafeAreaInsets: mockUseSafeAreaInsets } = require("react-native-safe-area-context");

const defaultProps = {
  barcode: "8901234567890",
  onClose: jest.fn(),
  onProductAdded: jest.fn(),
};

describe("GCP-STG-0439: NewProductScreenV3 safe area insets (BEHAVIORAL)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseSafeAreaInsets.mockClear();
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("useSafeAreaInsets is called during render", async () => {
    let tree: any;
    await act(async () => {
      tree = create(React.createElement(NewProductScreenV3, defaultProps));
    });
    expect(mockUseSafeAreaInsets).toHaveBeenCalled();
  });

  test("insets.top value flows into rendered output (not hardcoded)", async () => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    let tree1: any;
    await act(async () => {
      tree1 = create(React.createElement(NewProductScreenV3, defaultProps));
    });
    const json1 = JSON.stringify(tree1.toJSON());

    mockUseSafeAreaInsets.mockReturnValue({ top: 99, bottom: 34, left: 0, right: 0 });
    let tree2: any;
    await act(async () => {
      tree2 = create(React.createElement(NewProductScreenV3, defaultProps));
    });
    const json2 = JSON.stringify(tree2.toJSON());

    expect(json1).not.toEqual(json2);
  });

  test("renders without crashing (smoke test)", async () => {
    let tree: any;
    await act(async () => {
      tree = create(React.createElement(NewProductScreenV3, defaultProps));
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});
