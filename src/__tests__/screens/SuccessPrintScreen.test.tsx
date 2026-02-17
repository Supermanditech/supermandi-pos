/**
 * TQ-002: SuccessPrintScreenV2 render tests
 * Verifies the success/print screen renders correctly with critical UI elements.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// Mock navigation
const mockNavigate = jest.fn();
const mockReset = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, reset: mockReset }),
  useRoute: () => ({
    params: {
      paymentMode: "CASH",
      transactionId: "txn-test-001",
      billId: "BILL-001",
      saleItems: [
        { id: "item1", name: "Test Product", quantity: 2, priceMinor: 5000, currency: "INR" },
      ],
      saleTotalMinor: 10000,
      saleCurrency: "INR",
    },
  }),
}));

// Mock stores
jest.mock("../../stores/cartStore", () => ({
  useCartStore: () => ({
    items: [],
    total: 0,
    subtotal: 0,
    discountAmount: 0,
    discount: null,
    clearCart: jest.fn(),
    unlockCart: jest.fn(),
  }),
}));

// Mock services
jest.mock("../../services/eventLogger", () => ({
  eventLogger: { log: jest.fn() },
}));
jest.mock("../../services/cloudEventLogger", () => ({
  logPaymentEvent: jest.fn(),
  logPosEvent: jest.fn(),
}));
jest.mock("../../services/printerService", () => ({
  printerService: { printReceipt: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("../../services/offline/sync", () => ({
  syncOutbox: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/deviceSession", () => ({
  getDeviceStoreId: jest.fn().mockResolvedValue("store-123"),
}));
jest.mock("../../services/api/posApi", () => ({
  checkWhatsAppStatus: jest.fn().mockResolvedValue({ configured: false }),
  sendBillWhatsApp: jest.fn().mockResolvedValue({ sent: true }),
}));
jest.mock("../../utils/money", () => ({
  formatMoney: (minor: number) => `₹${(minor / 100).toFixed(2)}`,
}));
jest.mock("../../i18n/formatters", () => ({
  formatDateTime: () => "17/02/2026 21:00",
}));

import SuccessPrintScreenV2 from "../../screens/SuccessPrintScreenV2";

describe("SuccessPrintScreenV2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<SuccessPrintScreenV2 />);
  });

  it("shows payment success title for CASH payment", () => {
    render(<SuccessPrintScreenV2 />);
    expect(screen.getByText("Payment Successful")).toBeTruthy();
  });

  it("shows bill number", () => {
    render(<SuccessPrintScreenV2 />);
    expect(screen.getByText("Bill #BILL-001")).toBeTruthy();
  });

  it("has Print Receipt button", () => {
    render(<SuccessPrintScreenV2 />);
    expect(screen.getByText("Print Receipt")).toBeTruthy();
  });

  it("has No Print button", () => {
    render(<SuccessPrintScreenV2 />);
    expect(screen.getByText("No Print")).toBeTruthy();
  });

  it("shows choose print option status by default", () => {
    render(<SuccessPrintScreenV2 />);
    expect(screen.getByText("Choose print option")).toBeTruthy();
  });

  it("tapping No Print resets navigation to SellScan", () => {
    render(<SuccessPrintScreenV2 />);
    fireEvent.press(screen.getByText("No Print"));
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: "SellScan" }],
    });
  });
});

describe("SuccessPrintScreenV2 — DUE mode", () => {
  beforeEach(() => {
    const routeMock = require("@react-navigation/native");
    routeMock.useRoute = () => ({
      params: {
        paymentMode: "DUE",
        transactionId: "txn-due-001",
        billId: "DUE-001",
        saleItems: [
          { id: "item1", name: "DUE Item", quantity: 1, priceMinor: 3000, currency: "INR" },
        ],
        saleTotalMinor: 3000,
        saleCurrency: "INR",
      },
    });
  });

  it("shows 'Sale Recorded' for DUE payment mode", () => {
    render(<SuccessPrintScreenV2 />);
    expect(screen.getByText("Sale Recorded")).toBeTruthy();
  });
});
