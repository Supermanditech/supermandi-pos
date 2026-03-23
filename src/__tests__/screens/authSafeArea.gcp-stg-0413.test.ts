/**
 * GCP-STG-0413: Auth Screens Missing SafeAreaView — Content Behind Notch/Status Bar
 *
 * BEHAVIORAL test — renders each auth screen component with mocked
 * react-native-safe-area-context (via moduleNameMapper) and verifies:
 * 1. useSafeAreaInsets is called during render
 * 2. Changing insets.top produces different rendered output (dynamic, not hardcoded)
 * 3. Component renders without crashing
 *
 * Zero fs.readFileSync usage — purely runtime behavioral verification.
 */

// --- Mocks (BEFORE any component imports) ---
// Note: react-native-safe-area-context is mocked via moduleNameMapper in jest.config.js

const mockNavigation = { reset: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
const mockRoute = { params: { phone: "9876543210", stores: [{ id: "s1", name: "Store 1", code: "S1" }], otp: "123456" } };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
}));

jest.mock("react-native-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: any) => React.createElement("svg", props),
    Rect: (props: any) => React.createElement("rect", props),
    Circle: (props: any) => React.createElement("circle", props),
  };
});

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
jest.mock("../../services/api/apiClient", () => ({ apiClient: { post: jest.fn() } }));
jest.mock("../../services/deviceSession", () => ({
  getDeviceSession: jest.fn().mockResolvedValue(null),
  saveDeviceSession: jest.fn().mockResolvedValue(undefined),
  clearDeviceSession: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/cloudEventLogger", () => ({ startCloudEventLogger: jest.fn() }));
jest.mock("../../services/printerService", () => ({
  printerService: { initialize: jest.fn().mockReturnValue(Promise.resolve()) },
}));
jest.mock("../../services/syncService", () => ({ startAutoSync: jest.fn() }));
jest.mock("../../services/offline/localDb", () => ({ initOfflineDb: jest.fn().mockReturnValue(Promise.resolve()) }));
jest.mock("../../services/offline/sync", () => ({ syncOutbox: jest.fn().mockReturnValue(Promise.resolve()) }));
jest.mock("../../services/api/uiStatusApi", () => ({ fetchUiStatus: jest.fn().mockResolvedValue({ status: "ok" }) }));
jest.mock("../../services/deviceInfo", () => ({ getDeviceMeta: jest.fn().mockReturnValue({ deviceId: "test", appVersion: "1.0.0" }) }));
jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/api/staffApi", () => ({ staffLogin: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../../stores/staffSessionStore", () => ({
  useStaffSessionStore: Object.assign(jest.fn(() => ({})), {
    getState: () => ({ session: null, setSession: jest.fn(), clearSession: jest.fn() }),
  }),
}));
jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: Object.assign(jest.fn(() => "SuperMandi Store"), {
    getState: () => ({ setStoreName: jest.fn(), setStoreCode: jest.fn(), storeName: "Test", storeCode: "T1" }),
  }),
}));

// --- Imports (AFTER mocks) ---

import React from "react";
// @ts-expect-error react-test-renderer has no type declarations
import { create, act } from "react-test-renderer";

import SplashScreenV3 from "../../screens/v3/SplashScreenV3";
import PhoneScreenV3 from "../../screens/v3/PhoneScreenV3";
import OTPScreenV3 from "../../screens/v3/OTPScreenV3";
import StoreSelectScreenV3 from "../../screens/v3/StoreSelectScreenV3";
import StaffLoginScreenV3 from "../../screens/v3/StaffLoginScreenV3";

// Get the mock function from the shared mock (moduleNameMapper resolves this)
const { useSafeAreaInsets: mockUseSafeAreaInsets } = require("react-native-safe-area-context");

const AUTH_SCREENS: Array<{ name: string; Component: React.ComponentType<any> }> = [
  { name: "SplashScreenV3", Component: SplashScreenV3 },
  { name: "PhoneScreenV3", Component: PhoneScreenV3 },
  { name: "OTPScreenV3", Component: OTPScreenV3 },
  { name: "StoreSelectScreenV3", Component: StoreSelectScreenV3 },
  { name: "StaffLoginScreenV3", Component: StaffLoginScreenV3 },
];

describe("GCP-STG-0413: Auth screens SafeAreaView (BEHAVIORAL)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseSafeAreaInsets.mockClear();
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  for (const { name, Component } of AUTH_SCREENS) {
    describe(name, () => {
      test("useSafeAreaInsets is called during render", () => {
        mockUseSafeAreaInsets.mockClear();
        let tree: any;
        act(() => {
          tree = create(React.createElement(Component));
        });
        expect(mockUseSafeAreaInsets).toHaveBeenCalled();
        act(() => { tree.unmount(); });
      });

      test("insets.top value flows into rendered output (not hardcoded)", () => {
        // Helper: collect all style objects from the rendered tree
        const collectStyles = (tree: any): any[] => {
          const styles: any[] = [];
          try {
            tree.root.findAll((node: any) => {
              const s = node.props?.style;
              if (s) {
                const flat = Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s;
                if (flat.paddingTop !== undefined) styles.push(flat);
              }
              return false;
            });
          } catch { /* ignore traversal errors */ }
          return styles;
        };

        // Render with top=47
        mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
        let tree1: any;
        act(() => { tree1 = create(React.createElement(Component)); });
        const styles1 = collectStyles(tree1);
        act(() => { tree1.unmount(); });

        // Render with top=99
        mockUseSafeAreaInsets.mockReturnValue({ top: 99, bottom: 34, left: 0, right: 0 });
        let tree2: any;
        act(() => { tree2 = create(React.createElement(Component)); });
        const styles2 = collectStyles(tree2);
        act(() => { tree2.unmount(); });

        // At least one paddingTop must differ between renders, proving dynamic usage
        const tops1 = styles1.map((s: any) => s.paddingTop).sort();
        const tops2 = styles2.map((s: any) => s.paddingTop).sort();
        expect(JSON.stringify(tops1)).not.toEqual(JSON.stringify(tops2));
      });

      test("renders without crashing (smoke test)", () => {
        let tree: any;
        act(() => { tree = create(React.createElement(Component)); });
        expect(tree.toJSON()).toBeTruthy();
        act(() => { tree.unmount(); });
      });
    });
  }
});
