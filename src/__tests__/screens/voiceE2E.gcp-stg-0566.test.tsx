/**
 * GCP-STG-0566: Voice E2E mock test
 *
 * Verifies the voice-to-cart wiring: submitVoiceCommand returns a product match,
 * VoiceOverlayV3 processes it, and the cart store receives the item.
 * Uses mocked voice service — no actual audio recording.
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock config/api before any store imports
jest.mock("../../config/api", () => ({
  API_URL: "https://test.example.com",
  API_BASE_URL: "https://test.example.com",
}));

// Mock voice service
const mockSubmitVoiceCommand = jest.fn();
const mockStartRecording = jest.fn().mockResolvedValue(true);
const mockStopRecording = jest.fn().mockResolvedValue("file:///audio.m4a");
const mockCancelRecording = jest.fn().mockResolvedValue(undefined);

jest.mock("../../services/voice", () => ({
  startRecording: () => mockStartRecording(),
  stopRecording: () => mockStopRecording(),
  cancelRecording: () => mockCancelRecording(),
  submitVoiceCommand: (...args: any[]) => mockSubmitVoiceCommand(...args),
  VoiceRateLimitError: class extends Error { name = "VoiceRateLimitError"; },
  VoiceTimeoutError: class extends Error { name = "VoiceTimeoutError"; },
}));

// Mock network status (online)
jest.mock("../../services/networkStatus", () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));

// Mock device session
jest.mock("../../services/deviceSession", () => ({
  getDeviceStoreId: jest.fn().mockResolvedValue("store-test-1"),
}));

// Mock i18n
jest.mock("../../i18n", () => ({ default: { language: "en" } }));

// Mock logger
jest.mock("../../services/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock theme
jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    primary: "#2563EB",
    primaryLight: "#DBEAFE",
    success: "#16A34A",
    error: "#DC2626",
    textPrimary: "#111827",
    textSecondary: "#4B5563",
    textTertiary: "#9CA3AF",
    surface: "#F8FAFC",
    background: "#FFFFFF",
    border: "#E2E8F0",
  }),
}));

jest.mock("../../theme/responsive", () => ({
  getScreenPadding: () => 16,
}));

// Mock react-native-svg
jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => React.createElement(View, props),
    Svg: (props: any) => React.createElement(View, props),
    Rect: (props: any) => React.createElement(View, props),
    Path: (props: any) => React.createElement(View, props),
    Circle: (props: any) => React.createElement(View, props),
  };
});

// Mock showToast
const mockShowToast = jest.fn();
jest.mock("../../utils/showToast", () => ({
  showToast: (...args: any[]) => mockShowToast(...args),
}));

// Mock i18next
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }),
}));

// Mock cartPayload
jest.mock("../../services/cartPayload", () => ({
  buildCartItemFromVoice: (product: any, qty: number) => ({
    id: product.barcode ?? product.id,
    name: product.name,
    priceMinor: product.priceMinor,
    currency: "INR",
    quantity: qty,
    barcode: product.barcode,
  }),
  buildCartItem: jest.fn(),
}));

// ── Store setup ──────────────────────────────────────────────────────────────

import { useProductsStore } from "../../stores/productsStore";
import { useCartStore } from "../../stores/cartStore";

// Pre-populate products store
const TEST_PRODUCT = {
  id: "prod-sugar-1",
  name: "Sugar",
  priceMinor: 5000,
  barcode: "8901234567890",
  category: "Staples",
  stock: 50,
  currency: "INR",
  storeProductId: "sp-sugar-1",
};

// ── Component import ─────────────────────────────────────────────────────────
import VoiceOverlayV3 from "../../components/v3/VoiceOverlayV3";

describe("GCP-STG-0566: Voice E2E mock — voice command to cart", () => {
  const mockOnClose = jest.fn();
  const mockOnProductMatched = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up products store with test product
    useProductsStore.setState({ products: [TEST_PRODUCT as any], loading: false });
    // Clear cart
    useCartStore.setState({ items: [] });
  });

  it("adds product to cart when voice returns a successful match", async () => {
    // Mock submitVoiceCommand to return a match for "Sugar"
    mockSubmitVoiceCommand.mockResolvedValueOnce({
      success: true,
      transcript: "Add 2 kg sugar",
      message: "Add 2 kg Sugar",
      intent: {
        action: "ADD_TO_CART",
        productName: "Sugar",
        quantity: 2,
        slots: { query: "Sugar", quantity: 2 },
      },
      needsConfirm: true,
      confidence: 0.95,
    });

    const { getByText, queryByText } = render(
      <VoiceOverlayV3
        visible={true}
        onClose={mockOnClose}
        onProductMatched={mockOnProductMatched}
      />
    );

    // The overlay starts in "listening" state.
    // Tap "Done" to stop recording and submit.
    await act(async () => {
      fireEvent.press(getByText("Done"));
    });

    // Wait for "matched" state — the match box should show.
    await waitFor(() => {
      expect(queryByText(/Sugar/)).toBeTruthy();
    });

    // Tap the "Add" button (exact match to avoid hitting match text)
    await act(async () => {
      const addBtn = getByText(/^✓ Add$/);
      fireEvent.press(addBtn);
    });

    // Verify: cart should now contain the item
    const cartItems = useCartStore.getState().items;
    expect(cartItems.length).toBe(1);
    expect(cartItems[0].name).toBe("Sugar");
    expect(cartItems[0].quantity).toBe(2);

    // Verify callbacks were called
    expect(mockOnProductMatched).toHaveBeenCalledWith("Sugar", 2);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("shows error toast when voice command fails", async () => {
    mockSubmitVoiceCommand.mockResolvedValueOnce({
      success: false,
      transcript: "something unintelligible",
      message: "Could not match product — try again",
    });

    const { getByText } = render(
      <VoiceOverlayV3
        visible={true}
        onClose={mockOnClose}
        onProductMatched={mockOnProductMatched}
      />
    );

    await act(async () => {
      fireEvent.press(getByText("Done"));
    });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining("Could not match product")
      );
    });

    // Cart should remain empty
    expect(useCartStore.getState().items.length).toBe(0);
  });

  it("does not add to cart when product is not in store", async () => {
    mockSubmitVoiceCommand.mockResolvedValueOnce({
      success: true,
      transcript: "Add dal",
      message: "Add Dal",
      intent: {
        action: "ADD_TO_CART",
        productName: "Dal",
        quantity: 1,
        slots: { query: "Dal", quantity: 1 },
      },
      needsConfirm: true,
    });

    const { getByText, queryByText } = render(
      <VoiceOverlayV3
        visible={true}
        onClose={mockOnClose}
        onProductMatched={mockOnProductMatched}
      />
    );

    await act(async () => {
      fireEvent.press(getByText("Done"));
    });

    // Wait for match to display
    await waitFor(() => {
      expect(queryByText(/Dal/)).toBeTruthy();
    });

    // Tap Add — should fail because "Dal" is not in products store
    await act(async () => {
      const addBtn = getByText(/^✓ Add$/);
      fireEvent.press(addBtn);
    });

    // Should show "not found" toast
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining("not found in store")
    );

    // Cart should remain empty
    expect(useCartStore.getState().items.length).toBe(0);
  });
});
