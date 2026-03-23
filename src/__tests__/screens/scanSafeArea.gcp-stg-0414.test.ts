/**
 * GCP-STG-0414: ScanScreenV3 uses safe area insets instead of hardcoded paddingTop:48
 *
 * BEHAVIORAL test — renders ScanScreenV3 with mocked react-native-safe-area-context
 * (via moduleNameMapper) and verifies:
 * 1. useSafeAreaInsets is called during render
 * 2. Changing insets.top produces different rendered output (dynamic, not hardcoded)
 * 3. No hardcoded paddingTop:48 in the rendered tree
 *
 * Zero fs.readFileSync usage — purely runtime behavioral verification.
 */

// --- Mocks (BEFORE any component imports) ---
// Note: react-native-safe-area-context is mocked via moduleNameMapper in jest.config.js

jest.mock("react-native-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: any) => React.createElement("svg", props),
    Rect: (props: any) => React.createElement("rect", props),
    Path: (props: any) => React.createElement("path", props),
    Line: (props: any) => React.createElement("line", props),
    Circle: (props: any) => React.createElement("circle", props),
  };
});

// Mock expo-camera
jest.mock("expo-camera", () => ({
  CameraView: ({ children, ...props }: any) => {
    const React = require("react");
    return React.createElement(require("react-native").View, props, children);
  },
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#fff",
    text: "#000",
    primary: "#2563EB",
    card: "#f5f5f5",
    border: "#ddd",
    textSecondary: "#666",
    success: "#22c55e",
    error: "#ef4444",
  }),
}));
jest.mock("../../theme/responsive", () => ({
  getScreenPadding: () => ({ horizontal: 16, vertical: 8 }),
}));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../../stores/productsStore", () => ({
  useProductsStore: jest.fn((selector: any) => {
    if (typeof selector === "function") return selector({ getProductByBarcode: jest.fn() });
    return {};
  }),
}));
jest.mock("../../stores/cartStore", () => ({
  useCartStore: jest.fn((selector: any) => {
    if (typeof selector === "function") return selector({ addItem: jest.fn() });
    return {};
  }),
}));
jest.mock("../../services/hidScannerService", () => ({ setHidScanHandler: jest.fn() }));
jest.mock("../../services/cartPayload", () => ({ buildCartItem: jest.fn() }));
jest.mock("../../services/api/catalogApi", () => ({ buyBarcodeSearch: jest.fn() }));
jest.mock("../../services/deviceSession", () => ({ getDeviceStoreId: jest.fn().mockResolvedValue("store-1") }));
jest.mock("../../services/scanIntent", () => ({
  normalizeBarcode: (b: string) => b,
  isDuplicateScan: () => false,
}));

// --- Imports (AFTER mocks) ---

import React from "react";
// @ts-expect-error react-test-renderer has no type declarations
import { create } from "react-test-renderer";

import ScanScreenV3 from "../../screens/v3/ScanScreenV3";

// Get the mock function from the shared mock (moduleNameMapper resolves this)
const { useSafeAreaInsets: mockUseSafeAreaInsets } = require("react-native-safe-area-context");

const defaultProps = {
  visible: true,
  defaultContext: "sell_scan" as const,
  onClose: jest.fn(),
  onProductFound: jest.fn(),
  onNewProduct: jest.fn(),
};

describe("GCP-STG-0414: ScanScreenV3 safe area insets (BEHAVIORAL)", () => {
  beforeEach(() => {
    mockUseSafeAreaInsets.mockClear();
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  test("useSafeAreaInsets is called during render", () => {
    create(React.createElement(ScanScreenV3, defaultProps));
    expect(mockUseSafeAreaInsets).toHaveBeenCalled();
  });

  test("insets.top value flows into rendered output (not hardcoded)", () => {
    // Render with top=47 — paddingTop should be 47+8 = 55
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    const tree1 = create(React.createElement(ScanScreenV3, defaultProps));
    const json1 = JSON.stringify(tree1.toJSON());

    // Render with top=99 — paddingTop should be 99+8 = 107
    mockUseSafeAreaInsets.mockReturnValue({ top: 99, bottom: 34, left: 0, right: 0 });
    const tree2 = create(React.createElement(ScanScreenV3, defaultProps));
    const json2 = JSON.stringify(tree2.toJSON());

    // If the component uses insets.top dynamically, the two renders must differ
    expect(json1).not.toEqual(json2);
  });

  test("no hardcoded paddingTop:48 in rendered output", () => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    const tree = create(React.createElement(ScanScreenV3, defaultProps));
    const json = JSON.stringify(tree.toJSON());

    // The old hardcoded value was 48. With insets.top=47 the paddingTop should be 47+8=55, not 48.
    expect(json).not.toContain('"paddingTop":48');
  });

  test("renders without crashing (smoke test)", () => {
    const tree = create(React.createElement(ScanScreenV3, defaultProps));
    expect(tree.toJSON()).toBeTruthy();
  });
});
