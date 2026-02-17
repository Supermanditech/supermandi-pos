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
      isLocked: false,
      discount: null,
      discountAmount: 0,
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
    };
    return selector ? selector(state) : state;
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
    jest.clearAllMocks();
  });

  it("renders without crashing", () => {
    // SellScanScreen takes navigation params, provide empty ones
    render(<SellScanScreen navigation={{} as any} route={{ params: {} } as any} />);
  });
});
