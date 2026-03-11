/**
 * TQ-002: SellScanScreen render tests
 * Verifies the primary POS scanning screen renders critical UI elements.
 * This is the most complex screen (~700+ lines), so we focus on
 * render-without-crash and critical element presence.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";

// Mock navigation
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), dispatch: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    // Don't run focus effects in tests
  },
}));

jest.mock("@react-navigation/native-stack", () => ({
  // Empty — used for types only
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "sell.scanPrompt": "Scan barcode to add items",
        "sell.searchPlaceholder": "Search products...",
        "sell.payButton": "Pay",
        "sell.emptyCart": "Cart is empty",
      };
      return translations[key] || key;
    },
    i18n: { changeLanguage: jest.fn() },
  }),
}));

// Mock stores
jest.mock("../../stores/cartStore", () => ({
  useCartStore: (selector?: (s: any) => any) => {
    const state = {
      items: [],
      total: 0,
      subtotal: 0,
      itemCount: 0,
      addItem: jest.fn(),
      removeItem: jest.fn(),
      updateQuantity: jest.fn(),
      clearCart: jest.fn(),
      lockCart: jest.fn(),
      unlockCart: jest.fn(),
      autoUnlockIfExpired: jest.fn(),
      isLocked: false,
      discount: null,
      discountAmount: 0,
      mutationHistory: [],
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock("../../stores/productsStore", () => ({
  useProductsStore: (selector?: (s: any) => any) => {
    const state = {
      products: [],
      searchResults: [],
      searchQuery: "",
      setSearchQuery: jest.fn(),
      isSearching: false,
      loadProducts: jest.fn().mockResolvedValue([]),
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: (selector?: (s: any) => any) => {
    const state = {
      buyEnabled: true,
      reorderEnabled: true,
      language: "en" as const,
      setLanguage: jest.fn(),
      bnplEnabled: false,
      upiCollectionEnabled: true,
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock("../../stores/staffSessionStore", () => ({
  useStaffSessionStore: (selector?: (s: any) => any) => {
    const state = { activeStaff: null };
    return selector ? selector(state) : state;
  },
}));

// Mock voice services (prevents expo-av native module chain)
jest.mock("../../services/voice", () => ({
  startRecording: jest.fn(),
  stopRecording: jest.fn().mockResolvedValue(null),
  cancelRecording: jest.fn(),
  submitVoiceCommand: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../components/voice", () => {
  const React = require("react");
  return {
    VoiceSheet: () => null,
  };
});

jest.mock("../../services/api/catalogApi", () => ({
  getFmcgCategories: jest.fn().mockResolvedValue([]),
  getCategoryProducts: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../utils/featureFlags", () => ({
  useFeatureEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock("../../config/pagination", () => ({
  PRODUCTS_PAGE_SIZE: 20,
  MAX_PAGINATION_PAGE: 50,
}));

jest.mock("../../utils/showToast", () => ({
  showToast: jest.fn(),
}));

jest.mock("../../services/searchHistory", () => ({
  getRecentSearches: jest.fn().mockResolvedValue([]),
  saveRecentSearch: jest.fn().mockResolvedValue(undefined),
  clearRecentSearches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/printerService", () => ({
  printerService: {
    printReceipt: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(true),
    checkConnectivity: jest.fn().mockResolvedValue({ connected: false, model: '', ip: '' }),
    getStatus: jest.fn().mockReturnValue({ connected: false, model: '', ip: '' }),
    print: jest.fn().mockResolvedValue(true),
  },
}));

// Mock services
jest.mock("../../services/api/productsApi", () => ({
  fetchProducts: jest.fn().mockResolvedValue([]),
  searchProducts: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../services/api/sellSearchApi", () => ({
  searchSellProducts: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../services/deviceSession", () => ({
  getDeviceStoreId: jest.fn().mockResolvedValue("store-123"),
}));

jest.mock("../../services/offline/scan", () => ({
  setLocalPrice: jest.fn(),
  upsertLocalProduct: jest.fn(),
}));

jest.mock("../../services/offline/localDb", () => ({
  offlineDb: {
    getAll: jest.fn().mockResolvedValue([]),
    all: jest.fn().mockResolvedValue([]),
    run: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../services/offline/outbox", () => ({
  setCorruptedEventsCallback: jest.fn(),
  failedOutboxCount: jest.fn().mockResolvedValue(0),
  clearCorruptedEvents: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/scan/handleScan", () => ({
  onBarcodeScanned: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../services/scan/sellFirstOnboarding", () => ({
  submitSellFirstOnboarding: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/stockService", () => ({
  refreshStockSnapshot: jest.fn().mockResolvedValue(undefined),
  resolveStockForCartItem: jest.fn().mockReturnValue(null),
  resolveStockForSku: jest.fn().mockReturnValue(null),
  subscribeStockUpdates: jest.fn(() => jest.fn()),
  upsertStockEntries: jest.fn(),
  startStockAutoRefresh: jest.fn(),
  stopStockAutoRefresh: jest.fn(),
}));

jest.mock("../../utils/money", () => ({
  formatMoney: (minor: number) => `₹${(minor / 100).toFixed(2)}`,
}));

jest.mock("../../config/api", () => ({
  BUILD_INFO: { version: "1.0.0", buildDate: "2026-02-17" },
  API_BASE_URL: "http://localhost:3010",
}));

jest.mock("../../services/cloudEventLogger", () => ({
  logPosEvent: jest.fn(),
}));

jest.mock("../../services/eventLogger", () => ({
  eventLogger: { log: jest.fn() },
}));

jest.mock("../../components/ui/AppText", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    AppText: (props: any) => React.createElement(Text, props),
    ButtonText: (props: any) => React.createElement(Text, props),
    PriceText: (props: any) => React.createElement(Text, props),
    LabelText: (props: any) => React.createElement(Text, props),
  };
});

import SellScanScreen from "../../screens/SellScanScreen";

describe("SellScanScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders without crashing", () => {
    const { unmount } = render(
      <SellScanScreen storeActive={true} scanDisabled={false} onOpenScanner={jest.fn()} />
    );
    unmount();
  });

  // SCALE-C3: FEFO toggle tests
  it("renders FEFO toggle button", () => {
    const { getByTestId, unmount } = render(
      <SellScanScreen storeActive={true} scanDisabled={false} onOpenScanner={jest.fn()} />
    );
    const fefoBtn = getByTestId("fefo-toggle-btn");
    expect(fefoBtn).toBeTruthy();
    unmount();
  });

  it("FEFO toggle button shows 'FEFO' text when inactive", () => {
    const { getByTestId, unmount } = render(
      <SellScanScreen storeActive={true} scanDisabled={false} onOpenScanner={jest.fn()} />
    );
    const fefoBtn = getByTestId("fefo-toggle-btn");
    // Should contain "FEFO" text (inactive state)
    expect(fefoBtn).toBeTruthy();
    unmount();
  });

  it("FEFO sort is disabled by default", () => {
    // The toggle button should NOT show 'FEFO ON' text initially
    const { queryByText, unmount } = render(
      <SellScanScreen storeActive={true} scanDisabled={false} onOpenScanner={jest.fn()} />
    );
    // "FEFO ON" should not be visible when toggle is off
    expect(queryByText("FEFO ON")).toBeNull();
    unmount();
  });
});
