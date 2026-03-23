/**
 * GCP-STG-0443: SettingsScreenV3 uses safe area insets for paddingTop + paddingBottom
 *
 * BEHAVIORAL test — renders SettingsScreenV3 with mocked react-native-safe-area-context
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
    warning: "#f59e0b",
    backgroundSecondary: "#f0f0f0",
  }),
}));
jest.mock("../../theme/responsive", () => ({
  getScreenPadding: () => 16,
}));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/deviceSession", () => ({ clearDeviceSession: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../services/api/staffApi", () => ({
  listStaff: jest.fn().mockResolvedValue({ staff: [] }),
  createStaff: jest.fn().mockResolvedValue({}),
  toggleStaffActive: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../stores/settingsStore", () => {
  const fn = jest.fn((selector: any) => {
    if (typeof selector === "function") {
      return selector({
        language: "en",
        setLanguage: jest.fn(),
        themeMode: "light",
        toggleTheme: jest.fn(),
        storeName: "Test Store",
        printerAutoPrint: false,
        setPrinterAutoPrint: jest.fn(),
        upiVpa: null,
        lastSyncAt: null,
        expressCheckout: false,
        setExpressCheckout: jest.fn(),
        soundEnabled: true,
        setSoundEnabled: jest.fn(),
      });
    }
    return {};
  });
  (fn as any).getState = () => ({
    setUpiVpa: jest.fn(),
    setLastSyncAt: jest.fn(),
  });
  return { useSettingsStore: fn };
});
jest.mock("../../stores/staffSessionStore", () => {
  const fn = jest.fn((selector: any) => {
    if (typeof selector === "function") {
      return selector({ session: { name: "Owner", role: "MANAGER" } });
    }
    return {};
  });
  (fn as any).getState = () => ({
    session: { name: "Owner", role: "MANAGER" },
    clearSession: jest.fn(),
  });
  return { useStaffSessionStore: fn };
});
jest.mock("../../stores/syncStore", () => {
  const fn = jest.fn((selector: any) => {
    if (typeof selector === "function") {
      return selector({ outboxCount: 0 });
    }
    return {};
  });
  return { useSyncStore: fn };
});
jest.mock("../../i18n", () => ({
  changeLanguage: jest.fn(),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// --- Imports (AFTER mocks) ---

import React from "react";
// @ts-expect-error react-test-renderer has no type declarations
import { create } from "react-test-renderer";

import SettingsScreenV3 from "../../screens/v3/SettingsScreenV3";

// Get the mock function from the shared mock (moduleNameMapper resolves this)
const { useSafeAreaInsets: mockUseSafeAreaInsets } = require("react-native-safe-area-context");

const defaultProps = {
  onClose: jest.fn(),
  onSwitchStaff: jest.fn(),
  onLogout: jest.fn(),
};

describe("GCP-STG-0443: SettingsScreenV3 safe area insets (BEHAVIORAL)", () => {
  beforeEach(() => {
    mockUseSafeAreaInsets.mockClear();
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  test("useSafeAreaInsets is called during render", () => {
    create(React.createElement(SettingsScreenV3, defaultProps));
    expect(mockUseSafeAreaInsets).toHaveBeenCalled();
  });

  test("insets.top value flows into rendered output (not hardcoded)", () => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    const tree1 = create(React.createElement(SettingsScreenV3, defaultProps));
    const json1 = JSON.stringify(tree1.toJSON());

    mockUseSafeAreaInsets.mockReturnValue({ top: 99, bottom: 34, left: 0, right: 0 });
    const tree2 = create(React.createElement(SettingsScreenV3, defaultProps));
    const json2 = JSON.stringify(tree2.toJSON());

    // If the component uses insets.top dynamically, the two renders must differ
    expect(json1).not.toEqual(json2);
  });

  test("renders without crashing (smoke test)", () => {
    const tree = create(React.createElement(SettingsScreenV3, defaultProps));
    expect(tree.toJSON()).toBeTruthy();
  });
});
