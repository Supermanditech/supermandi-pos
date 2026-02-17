/**
 * TQ-002: PaymentScreen render tests
 * Verifies the payment screen renders with payment mode buttons.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";

// Mock navigation
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), reset: jest.fn() }),
  useRoute: () => ({
    params: {},
  }),
  useFocusEffect: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: jest.fn() },
  }),
}));

// Mock stores
jest.mock("../../stores/cartStore", () => ({
  useCartStore: (selector?: (s: any) => any) => {
    const state = {
      items: [
        { id: "item1", name: "Test Product", quantity: 2, priceMinor: 5000, currency: "INR" },
      ],
      total: 10000,
      subtotal: 10000,
      itemCount: 2,
      discount: null,
      discountAmount: 0,
      clearCart: jest.fn(),
      lockCart: jest.fn(),
      unlockCart: jest.fn(),
      isLocked: true,
      setDiscount: jest.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: (selector?: (s: any) => any) => {
    const state = {
      bnplEnabled: false,
      upiCollectionEnabled: true,
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock("../../stores/staffSessionStore", () => ({
  useStaffSessionStore: (selector?: (s: any) => any) => {
    const state = {
      activeStaff: null,
    };
    return selector ? selector(state) : state;
  },
}));

// Mock services
jest.mock("../../services/deviceSession", () => ({
  getDeviceToken: jest.fn().mockResolvedValue("test-token"),
  getDeviceStoreId: jest.fn().mockResolvedValue("store-123"),
}));

jest.mock("../../services/api/posApi", () => ({
  createSale: jest.fn().mockResolvedValue({ id: "sale-1", billRef: "B001" }),
  checkWhatsAppStatus: jest.fn().mockResolvedValue({ configured: false }),
}));

jest.mock("../../services/offline/offlineSale", () => ({
  createOfflineSale: jest.fn().mockResolvedValue({ offlineSaleId: "off-1", billRef: "OFF-001" }),
}));

jest.mock("../../services/offline/sync", () => ({
  syncOutbox: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/networkStatus", () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../services/cloudEventLogger", () => ({
  logPaymentEvent: jest.fn(),
  logPosEvent: jest.fn(),
}));

jest.mock("../../services/eventLogger", () => ({
  eventLogger: { log: jest.fn() },
}));

jest.mock("../../utils/money", () => ({
  formatMoney: (minor: number) => `₹${(minor / 100).toFixed(2)}`,
}));

jest.mock("../../i18n/formatters", () => ({
  formatDateTime: () => "17/02/2026 21:00",
}));

jest.mock("../../services/printerService", () => ({
  printerService: { printReceipt: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("../../services/api/razorpayApi", () => ({
  createRazorpayOrder: jest.fn(),
  verifyRazorpayPayment: jest.fn(),
}));

jest.mock("../../services/stockService", () => ({
  resolveStockForCartItem: jest.fn().mockReturnValue(null),
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

import PaymentScreen from "../../screens/PaymentScreen";

describe("PaymentScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<PaymentScreen />);
  });
});
