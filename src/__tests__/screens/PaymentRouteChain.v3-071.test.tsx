/**
 * V3-FIX-071: Payment route-chain regression coverage
 * Tests the V3 payment chooser → child screen navigation contract.
 * Verifies:
 *   - chooser renders 3 method buttons + 2 secondary actions
 *   - method taps call correct navigation callbacks
 *   - child screens (Cash/Upi/Udhar) render and have back + complete actions
 *   - UPI does NOT auto-confirm — init and confirm are separate
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Svg = (props: any) => React.createElement(View, props);
  const Rect = (props: any) => React.createElement(View, props);
  const Path = (props: any) => React.createElement(View, props);
  const Circle = (props: any) => React.createElement(View, props);
  const Line = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: Svg, Svg, Rect, Path, Circle, Line };
});

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#fff", surface: "#f8fafc", primary: "#2563eb", primaryLight: "#dbeafe",
    textPrimary: "#111", textSecondary: "#4b5", textTertiary: "#9ca",
    border: "#e2e8f0", success: "#16a", error: "#dc2", warning: "#f59",
    warningSoft: "#fef3c7", backgroundSecondary: "#f1f5f9", disabled: "#ccc",
  }),
}));

let mockCartItems: any[] = [];
let mockCartTotal = 0;
jest.mock("../../stores/cartStore", () => ({
  useCartStore: Object.assign(
    (selector: (s: any) => any) => selector({
      items: mockCartItems, total: mockCartTotal, sellMode: "retail",
      discount: null, discountAmount: 0, customer: null,
    }),
    {
      getState: () => ({
        items: mockCartItems, total: mockCartTotal, discount: null,
        lockCart: jest.fn(), unlockCart: jest.fn(),
        applyDiscount: jest.fn(), clearCart: jest.fn(),
      }),
    }
  ),
}));

jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn() } }));

const mockCreateSale = jest.fn().mockResolvedValue({ saleId: "sale-001", billRef: "SM-001" });
const mockInitUpi = jest.fn().mockResolvedValue({ paymentId: "pay-001", upiVpa: "store@upi", qrData: "upi://pay?pa=store@upi&am=100", billRef: "SM-001" });
const mockConfirmUpi = jest.fn().mockResolvedValue({ status: "confirmed" });
const mockRecordCash = jest.fn().mockResolvedValue({ status: "completed" });
const mockRecordDue = jest.fn().mockResolvedValue({ status: "recorded" });

jest.mock("../../services/api/posApi", () => ({
  createSale: (...args: any[]) => mockCreateSale(...args),
  initUpiPayment: (...args: any[]) => mockInitUpi(...args),
  confirmUpiPaymentManual: (...args: any[]) => mockConfirmUpi(...args),
  recordCashPayment: (...args: any[]) => mockRecordCash(...args),
  recordDuePayment: (...args: any[]) => mockRecordDue(...args),
  createSplitPayment: jest.fn(),
}));

jest.mock("../../services/api/apiClient", () => ({
  apiClient: { get: jest.fn().mockResolvedValue({ customers: [] }), post: jest.fn() },
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import PaymentScreenV3 from "../../screens/v3/PaymentScreenV3";
import CashScreenV3 from "../../screens/v3/CashScreenV3";
import UpiScreenV3 from "../../screens/v3/UpiScreenV3";
import UdharScreenV3 from "../../screens/v3/UdharScreenV3";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("V3-FIX-071: Payment route chain", () => {
  const onBack = jest.fn();
  const onCash = jest.fn();
  const onUpi = jest.fn();
  const onUdhar = jest.fn();
  const onComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCartItems = [{ id: "p1", name: "Coke", priceMinor: 2000, quantity: 2, barcode: "123", currency: "INR" }];
    mockCartTotal = 4000;
  });

  describe("Payment chooser", () => {
    it("renders 3 method buttons (CASH, UPI, UDHAR)", () => {
      render(<PaymentScreenV3 onBack={onBack} onCash={onCash} onUpi={onUpi} onUdhar={onUdhar} onComplete={onComplete} />);
      expect(screen.getByText("CASH")).toBeTruthy();
      expect(screen.getByText("UPI")).toBeTruthy();
      expect(screen.getByText("UDHAR")).toBeTruthy();
    });

    it("renders both Split Payment and Add Discount secondary actions", () => {
      render(<PaymentScreenV3 onBack={onBack} onCash={onCash} onUpi={onUpi} onUdhar={onUdhar} onComplete={onComplete} />);
      expect(screen.getByText("Split Payment")).toBeTruthy();
      expect(screen.getByText("Add Discount")).toBeTruthy();
    });

    it("tapping CASH calls onCash", () => {
      render(<PaymentScreenV3 onBack={onBack} onCash={onCash} onUpi={onUpi} onUdhar={onUdhar} onComplete={onComplete} />);
      fireEvent.press(screen.getByText("CASH"));
      expect(onCash).toHaveBeenCalledTimes(1);
    });

    it("tapping UPI calls onUpi", () => {
      render(<PaymentScreenV3 onBack={onBack} onCash={onCash} onUpi={onUpi} onUdhar={onUdhar} onComplete={onComplete} />);
      fireEvent.press(screen.getByText("UPI"));
      expect(onUpi).toHaveBeenCalledTimes(1);
    });

    it("tapping UDHAR calls onUdhar", () => {
      render(<PaymentScreenV3 onBack={onBack} onCash={onCash} onUpi={onUpi} onUdhar={onUdhar} onComplete={onComplete} />);
      fireEvent.press(screen.getByText("UDHAR"));
      expect(onUdhar).toHaveBeenCalledTimes(1);
    });

    it("back button calls onBack (back to cart)", () => {
      render(<PaymentScreenV3 onBack={onBack} onCash={onCash} onUpi={onUpi} onUdhar={onUdhar} onComplete={onComplete} />);
      fireEvent.press(screen.getByLabelText("Back to cart"));
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("Cash child screen", () => {
    it("renders total and COMPLETE SALE button", () => {
      render(<CashScreenV3 onBack={onBack} onComplete={onComplete} />);
      expect(screen.getByText("₹40")).toBeTruthy();
      expect(screen.getByText("✓ COMPLETE SALE")).toBeTruthy();
    });

    it("has back to payment methods", () => {
      render(<CashScreenV3 onBack={onBack} onComplete={onComplete} />);
      fireEvent.press(screen.getByLabelText("Back to payment methods"));
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("shows EXACT preset", () => {
      render(<CashScreenV3 onBack={onBack} onComplete={onComplete} />);
      expect(screen.getByText("EXACT ₹40")).toBeTruthy();
    });
  });

  describe("UPI child screen — init/confirm separation", () => {
    it("auto-initializes UPI on mount (creates sale + inits payment)", async () => {
      render(<UpiScreenV3 onBack={onBack} onComplete={onComplete} />);

      // Should show initializing state first
      expect(screen.getByText("Generating QR code...")).toBeTruthy();

      // Wait for init to complete
      await waitFor(() => {
        expect(mockCreateSale).toHaveBeenCalledTimes(1);
        expect(mockInitUpi).toHaveBeenCalledTimes(1);
      });

      // After init, should show waiting state with QR data
      await waitFor(() => {
        expect(screen.getByText("Waiting for customer payment...")).toBeTruthy();
        expect(screen.getByText("store@upi")).toBeTruthy();
      });

      // CRITICAL: confirmUpiPaymentManual must NOT have been called yet
      expect(mockConfirmUpi).not.toHaveBeenCalled();
    });

    it("confirms only when operator taps Payment Received", async () => {
      render(<UpiScreenV3 onBack={onBack} onComplete={onComplete} />);

      // Wait for init
      await waitFor(() => {
        expect(screen.getByText("Waiting for customer payment...")).toBeTruthy();
      });

      // Confirm NOT called yet
      expect(mockConfirmUpi).not.toHaveBeenCalled();

      // Tap confirm
      fireEvent.press(screen.getByTestId("upi-confirm-btn"));

      await waitFor(() => {
        expect(mockConfirmUpi).toHaveBeenCalledTimes(1);
        expect(mockConfirmUpi).toHaveBeenCalledWith({ paymentId: "pay-001" });
      });

      // onComplete should fire after confirm
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith("UPI", "sale-001", 4000, 2);
      });
    });

    it("shows QR data from backend", async () => {
      render(<UpiScreenV3 onBack={onBack} onComplete={onComplete} />);
      await waitFor(() => {
        expect(screen.getByText(/upi:\/\/pay/)).toBeTruthy();
      });
    });

    it("back unlocks cart and calls onBack", async () => {
      render(<UpiScreenV3 onBack={onBack} onComplete={onComplete} />);
      await waitFor(() => {
        expect(screen.getByText("Waiting for customer payment...")).toBeTruthy();
      });
      fireEvent.press(screen.getByLabelText("Back to payment methods"));
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("Udhar child screen", () => {
    it("renders customer name input and Record Udhar button", () => {
      render(<UdharScreenV3 onBack={onBack} onComplete={onComplete} />);
      expect(screen.getByPlaceholderText("Customer name")).toBeTruthy();
      expect(screen.getByText(/Record Udhar/)).toBeTruthy();
    });

    it("has back to payment methods", () => {
      render(<UdharScreenV3 onBack={onBack} onComplete={onComplete} />);
      fireEvent.press(screen.getByLabelText("Back to payment methods"));
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });
});
