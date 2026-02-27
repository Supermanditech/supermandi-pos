/**
 * TQ-002: MenuScreen render tests
 * Verifies the menu screen renders with critical navigation items.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";

// Mock navigation
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, dispatch: jest.fn() }),
  CommonActions: { reset: jest.fn() },
}));

// Mock stores
jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: (selector: (s: any) => any) => {
    const state = {
      buyEnabled: true,
      reorderEnabled: true,
      language: "en" as const,
      setLanguage: jest.fn(),
    };
    return selector(state);
  },
}));

jest.mock("../../stores/staffSessionStore", () => ({
  useStaffSessionStore: (selector: (s: any) => any) => {
    const state = {
      activeStaff: null,
      clearStaffSession: jest.fn(),
    };
    return selector(state);
  },
}));

jest.mock("../../stores/cartStore", () => ({
  useCartStore: (selector: (s: any) => any) => {
    const state = { items: [], clearCart: jest.fn() };
    return selector(state);
  },
}));

jest.mock("../../stores/purchaseDraftStore", () => ({
  usePurchaseDraftStore: (selector: (s: any) => any) => {
    const state = { clearDraft: jest.fn() };
    return selector(state);
  },
}));

jest.mock("../../stores/productsStore", () => ({
  useProductsStore: (selector: (s: any) => any) => {
    const state = { clearProductsCache: jest.fn() };
    return selector(state);
  },
}));

// Mock services
jest.mock("../../services/deviceSession", () => ({
  getDeviceToken: jest.fn().mockResolvedValue("test-device-token"),
  clearDeviceSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/api/uiStatusApi", () => ({
  fetchUiStatus: jest.fn().mockResolvedValue({
    status: "ok",
    version: "1.0.0",
    features: {},
  }),
}));

jest.mock("../../services/api/dailySummaryApi", () => ({
  getDailySummary: jest.fn().mockResolvedValue({
    salesCount: 5,
    salesTotalMinor: 50000,
    currency: "INR",
    topProduct: "Test Product",
  }),
}));

jest.mock("../../services/cloudEventLogger", () => ({
  logPosEvent: jest.fn(),
}));

jest.mock("../../services/offline/outbox", () => ({
  pendingOutboxCount: jest.fn().mockResolvedValue(0),
}));

jest.mock("../../services/offline/sync", () => ({
  syncOutbox: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/networkStatus", () => ({
  subscribeNetworkStatus: jest.fn(() => jest.fn()),
}));

jest.mock("../../utils/money", () => ({
  formatMoney: (minor: number) => `₹${(minor / 100).toFixed(2)}`,
}));

jest.mock("../../services/printerService", () => ({
  printerService: {
    getStatus: jest.fn().mockReturnValue({ connected: false, model: '', ip: '' }),
    initialize: jest.fn().mockResolvedValue(true),
    checkConnectivity: jest.fn().mockResolvedValue({ connected: false, model: '', ip: '' }),
    print: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock("../../config/api", () => ({
  BUILD_INFO: { version: "1.0.0", buildDate: "2026-02-17" },
  API_BASE_URL: "http://localhost:3010",
}));

jest.mock("../../i18n", () => ({
  LANGUAGE_NAMES: { en: "English", hi: "हिंदी" },
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: jest.fn() },
  }),
}));

jest.mock("react-native-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: any) => React.createElement("View", props),
    Path: (props: any) => React.createElement("View", props),
    Rect: (props: any) => React.createElement("View", props),
    Circle: (props: any) => React.createElement("View", props),
  };
});

// Mock QA menu check
jest.mock("../../screens/UiShowcaseScreen", () => ({
  isQaMenuEnabled: () => false,
}));

import MenuScreen from "../../screens/MenuScreen";

describe("MenuScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<MenuScreen />);
  });

  it("shows Sales History menu item", () => {
    render(<MenuScreen />);
    expect(screen.getByText("menu.salesHistory")).toBeTruthy();
  });

  it("shows Settings section", () => {
    render(<MenuScreen />);
    // The menu has language/printer/settings items
    expect(screen.getByText(/menu\.language/)).toBeTruthy();
  });
});
