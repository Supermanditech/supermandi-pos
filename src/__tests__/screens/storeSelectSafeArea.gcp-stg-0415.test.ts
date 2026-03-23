/**
 * GCP-STG-0415: StoreSelectScreenV3 uses safe area insets instead of hardcoded paddingTop:60
 *
 * BEHAVIORAL test — renders the component with mocked react-native-safe-area-context
 * and verifies useSafeAreaInsets is called and insets.top flows into styles.
 */

// Mock react-native-safe-area-context BEFORE importing the component
const mockUseSafeAreaInsets = jest.fn().mockReturnValue({ top: 42, bottom: 0, left: 0, right: 0 });
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: mockUseSafeAreaInsets,
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: ({ children }: any) => children,
}));

// Mock navigation
const mockNavigation = { reset: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
const mockRoute = { params: { phone: "9876543210", stores: [{ id: "s1", name: "Store 1", code: "S1" }] } };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
}));

// Mock react-native-svg
jest.mock("react-native-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: any) => React.createElement("svg", props),
    Rect: (props: any) => React.createElement("rect", props),
    Circle: (props: any) => React.createElement("circle", props),
  };
});

// Mock internal dependencies
jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#fff",
    text: "#000",
    primary: "#2563EB",
    card: "#f5f5f5",
    border: "#ddd",
    textSecondary: "#666",
  }),
}));
jest.mock("../../theme/responsive", () => ({
  getScreenPadding: () => ({ horizontal: 16, vertical: 8 }),
}));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/api/apiClient", () => ({ apiClient: { post: jest.fn() } }));
jest.mock("../../services/deviceSession", () => ({ saveDeviceSession: jest.fn() }));
jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: Object.assign(jest.fn(() => ({})), {
    getState: () => ({ setStoreName: jest.fn(), setStoreCode: jest.fn() }),
  }),
}));

import React from "react";
// @ts-expect-error react-test-renderer has no type declarations
import { create } from "react-test-renderer";

import StoreSelectScreenV3 from "../../screens/v3/StoreSelectScreenV3";

describe("GCP-STG-0415: StoreSelectScreenV3 safe area insets (BEHAVIORAL)", () => {
  beforeEach(() => {
    mockUseSafeAreaInsets.mockClear();
  });

  test("useSafeAreaInsets is called during render", () => {
    create(React.createElement(StoreSelectScreenV3));
    expect(mockUseSafeAreaInsets).toHaveBeenCalled();
  });

  test("insets.top value flows into rendered output (no hardcoded 60)", () => {
    // Render with top=42 — if code uses the inset value, styles will reflect 42
    mockUseSafeAreaInsets.mockReturnValue({ top: 42, bottom: 0, left: 0, right: 0 });
    const tree1 = create(React.createElement(StoreSelectScreenV3));
    const json1 = JSON.stringify(tree1.toJSON());

    // Render with top=99 — styles should differ if insets.top is actually used
    mockUseSafeAreaInsets.mockReturnValue({ top: 99, bottom: 0, left: 0, right: 0 });
    const tree2 = create(React.createElement(StoreSelectScreenV3));
    const json2 = JSON.stringify(tree2.toJSON());

    // The two renders must produce different style output (proving dynamic inset usage)
    expect(json1).not.toEqual(json2);
  });

  test("renders without crashing (smoke test)", () => {
    const tree = create(React.createElement(StoreSelectScreenV3));
    expect(tree.toJSON()).toBeTruthy();
  });
});
