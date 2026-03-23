/**
 * GCP-STG-0441: KhataScreenV3 uses safe area insets for paddingTop + paddingBottom
 *
 * BEHAVIORAL test — renders KhataScreenV3 with mocked react-native-safe-area-context
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
    error: "#ef4444",
    errorSoft: "#fef2f2",
    warning: "#f59e0b",
  }),
}));
jest.mock("../../theme/responsive", () => ({ getScreenPadding: () => 16 }));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/api/posApi", () => ({
  recordCollectionCash: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../stores/khataStore", () => ({
  useKhataStore: jest.fn((selector: any) => {
    if (typeof selector === "function") {
      return selector({ customers: [], loading: false, fetchCustomers: jest.fn().mockResolvedValue([]) });
    }
    return {};
  }),
}));
jest.mock("react-native-svg", () => {
  const React = require("react");
  const mock = (name: string) => (props: any) => React.createElement("View", props);
  return { __esModule: true, default: mock("Svg"), Path: mock("Path") };
});

// --- Imports (AFTER mocks) ---

import React from "react";
// @ts-expect-error react-test-renderer has no type declarations
import { create } from "react-test-renderer";

import KhataScreenV3 from "../../screens/v3/KhataScreenV3";

const { useSafeAreaInsets: mockUseSafeAreaInsets } = require("react-native-safe-area-context");

const defaultProps = { onClose: jest.fn() };

describe("GCP-STG-0441: KhataScreenV3 safe area insets (BEHAVIORAL)", () => {
  beforeEach(() => {
    mockUseSafeAreaInsets.mockClear();
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  test("useSafeAreaInsets is called during render", () => {
    create(React.createElement(KhataScreenV3, defaultProps));
    expect(mockUseSafeAreaInsets).toHaveBeenCalled();
  });

  test("insets.top value flows into rendered output (not hardcoded)", () => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    const tree1 = create(React.createElement(KhataScreenV3, defaultProps));
    const json1 = JSON.stringify(tree1.toJSON());

    mockUseSafeAreaInsets.mockReturnValue({ top: 99, bottom: 34, left: 0, right: 0 });
    const tree2 = create(React.createElement(KhataScreenV3, defaultProps));
    const json2 = JSON.stringify(tree2.toJSON());

    expect(json1).not.toEqual(json2);
  });

  test("renders without crashing (smoke test)", () => {
    const tree = create(React.createElement(KhataScreenV3, defaultProps));
    expect(tree.toJSON()).toBeTruthy();
  });
});
