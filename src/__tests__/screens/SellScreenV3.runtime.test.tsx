/**
 * V3-HARDEN-063: SELL-home runtime tests — real mounted Jest/RNTL tests
 *
 * These are REAL mounted component tests using @testing-library/react-native.
 * They render SellScreenV3, interact with it via fireEvent, and assert
 * on actual rendered output — NOT source text inspection.
 *
 * Coverage scoped to:
 *  - Welcome guide persistence behavior
 *  - Feature-flag gated visibility (voiceEnabled, categoryBrowsingEnabled)
 *  - Category switching behavior
 *  - Cart identity / add-to-cart behavior
 *  - Shell states: cart-empty, loading, empty-category, empty-frequent
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Navigation mock ─────────────────────────────────────────────────────────
const mockNavigate = jest.fn();
const mockParentNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    getParent: () => ({ navigate: mockParentNavigate }),
  }),
}));

// ─── react-native-svg mock ───────────────────────────────────────────────────
jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Svg = (props: any) => React.createElement(View, { ...props, testID: props.testID || "svg" });
  const Rect = (props: any) => React.createElement(View, props);
  const Path = (props: any) => React.createElement(View, props);
  const Circle = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: Svg, Svg, Rect, Path, Circle };
});

// ─── Theme mock ──────────────────────────────────────────────────────────────
jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#FFFFFF",
    surface: "#F8FAFC",
    primary: "#2563EB",
    primaryLight: "#DBEAFE",
    textPrimary: "#111827",
    textSecondary: "#4B5563",
    textTertiary: "#9CA3AF",
    backgroundSecondary: "#F1F5F9",
    border: "#E2E8F0",
    success: "#16A34A",
    error: "#DC2626",
  }),
}));

// ─── Service mocks ───────────────────────────────────────────────────────────
const mockGetDeviceStoreId = jest.fn().mockResolvedValue("store-test-1");
jest.mock("../../services/deviceSession", () => ({
  getDeviceStoreId: () => mockGetDeviceStoreId(),
}));

jest.mock("../../services/networkStatus", () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));

const mockSearchStoreProducts = jest.fn().mockResolvedValue([]);
jest.mock("../../services/api/sellSearchApi", () => ({
  searchStoreProducts: (...args: unknown[]) => mockSearchStoreProducts(...args),
}));

const mockGetSellCategoryGroups = jest.fn().mockResolvedValue([
  { label: "Frequent", count: 5 },
  { label: "Beverages", count: 10 },
  { label: "Snacks", count: 8 },
  { label: "Dairy", count: 4 },
]);
jest.mock("../../services/api/catalogApi", () => ({
  getSellCategoryGroups: (...args: unknown[]) => mockGetSellCategoryGroups(...args),
}));

const mockGetFrequentProducts = jest.fn().mockResolvedValue([]);
jest.mock("../../services/api/productsApi", () => ({
  getFrequentProducts: () => mockGetFrequentProducts(),
}));

jest.mock("../../utils/money", () => ({
  formatMoney: (v: number) => `₹${Math.round(v / 100)}`,
}));

const mockShowToast = jest.fn();
jest.mock("../../utils/showToast", () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

jest.mock("../../services/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// ─── Voice service mock ──────────────────────────────────────────────────────
jest.mock("../../services/voice", () => ({
  requestMicPermission: jest.fn().mockResolvedValue(true),
  startVoiceRecognition: jest.fn(),
  stopVoiceRecognition: jest.fn(),
}));

// ─── Store mocks ─────────────────────────────────────────────────────────────
// We need functional zustand stores for cart behavior tests.
// productsStore and settingsStore are mocked with controllable state.

let mockProducts: any[] = [];
let mockProductsLoading = false;
const mockLoadProducts = jest.fn();
const mockCheckAndRefresh = jest.fn();
jest.mock("../../stores/productsStore", () => ({
  useProductsStore: (selector: (s: any) => any) => {
    const state = {
      products: mockProducts,
      loading: mockProductsLoading,
      loadProducts: mockLoadProducts,
      checkAndRefresh: mockCheckAndRefresh,
    };
    return selector(state);
  },
}));

let mockCartItems: any[] = [];
const mockAddItem = jest.fn().mockImplementation((item: any) => {
  mockCartItems = [...mockCartItems, { ...item, quantity: 1 }];
});
const mockUpdateQuantity = jest.fn();
const mockCartGetState = () => ({
  items: mockCartItems,
  updateQuantity: mockUpdateQuantity,
});
jest.mock("../../stores/cartStore", () => ({
  useCartStore: Object.assign(
    (selector: (s: any) => any) => {
      const state = {
        items: mockCartItems,
        addItem: mockAddItem,
        updateQuantity: mockUpdateQuantity,
      };
      return selector(state);
    },
    { getState: mockCartGetState }
  ),
  // Re-export SellMode type — TypeScript only, no runtime effect
}));

let mockVoiceEnabled = true;
let mockCategoryBrowsingEnabled = true;
jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: (selector: (s: any) => any) => {
    const state = {
      voiceEnabled: mockVoiceEnabled,
      categoryBrowsingEnabled: mockCategoryBrowsingEnabled,
    };
    return selector(state);
  },
}));

// ─── Child component stubs ───────────────────────────────────────────────────
// Stub complex children to isolate SellScreenV3 behavior.
// These prevent native dependency chains while keeping props visible to tests.
jest.mock("../../components/v3/BrandedHeader", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) =>
      React.createElement(View, { testID: "branded-header" },
        React.createElement(Text, null, "BrandedHeader"),
        props.onMenuPress && React.createElement(
          require("react-native").Pressable,
          { testID: "header-menu-btn", onPress: props.onMenuPress },
          React.createElement(Text, null, "Menu")
        )
      ),
  };
});

jest.mock("../../components/v3/CartSheetV3", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) =>
      props.visible
        ? React.createElement(View, { testID: "cart-sheet" },
            React.createElement(Text, null, "CartSheet"))
        : null,
  };
});

jest.mock("../../components/v3/VoiceOverlayV3", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) =>
      props.visible
        ? React.createElement(View, { testID: "voice-overlay" },
            React.createElement(Text, null, "VoiceOverlay"))
        : null,
  };
});

jest.mock("../../components/v3/UniversalSearchV3", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) =>
      props.visible
        ? React.createElement(View, { testID: "universal-search" },
            React.createElement(Text, null, "UniversalSearch"))
        : null,
  };
});

jest.mock("../../components/v3/ProductTileV3", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) =>
      React.createElement(
        Pressable,
        { testID: `tile-${props.product.id}`, onPress: props.onPress },
        React.createElement(Text, null, props.product.name)
      ),
  };
});

jest.mock("../../components/v3/CustomerTypeToggle", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../components/ui/OfflineBanner", () => ({
  OfflineBanner: () => null,
}));

// ─── Import AFTER all mocks ─────────────────────────────────────────────────
import SellScreenV3 from "../../screens/v3/SellScreenV3";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function resetState() {
  mockProducts = [];
  mockProductsLoading = false;
  mockCartItems = [];
  mockVoiceEnabled = true;
  mockCategoryBrowsingEnabled = true;
  jest.clearAllMocks();
  mockGetDeviceStoreId.mockResolvedValue("store-test-1");
  mockGetSellCategoryGroups.mockResolvedValue([
    { label: "Frequent", count: 5 },
    { label: "Beverages", count: 10 },
    { label: "Snacks", count: 8 },
    { label: "Dairy", count: 4 },
  ]);
  mockGetFrequentProducts.mockResolvedValue([]);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SellScreenV3 — runtime mounted tests (V3-HARDEN-063)", () => {
  beforeEach(() => {
    resetState();
  });

  // ═══ Shell states ═══════════════════════════════════════════════════════════

  describe("Shell states", () => {
    it("shows cart-empty strip when cart is empty", async () => {
      mockCartItems = [];
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText("Cart empty — tap product or scan barcode")).toBeTruthy();
      });
    });

    it("shows loading state with ActivityIndicator when products loading", async () => {
      mockProductsLoading = true;
      mockProducts = [];
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText("Loading products...")).toBeTruthy();
      });
    });

    it("shows empty-frequent state when Frequent has no products", async () => {
      mockProducts = [];
      mockGetFrequentProducts.mockResolvedValue([]);
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText("No frequent items yet")).toBeTruthy();
        expect(screen.getByText(/Complete a few sales/)).toBeTruthy();
      });
    });

    it("shows empty-category state with category name", async () => {
      // Provide some products so the screen isn't in "No products yet"
      mockProducts = [
        { id: "p1", name: "Coke", priceMinor: 2000, currency: "INR", category: "Beverages", stock: 10 },
      ];
      render(<SellScreenV3 />);

      // Wait for categories to load, then switch to a category with no matches
      await waitFor(() => {
        expect(screen.getByText("Dairy")).toBeTruthy();
      });
      fireEvent.press(screen.getByText("Dairy"));

      await waitFor(() => {
        expect(screen.getByText("No Dairy products")).toBeTruthy();
      });
    });

    it("shows 'No products yet' when store has zero products", async () => {
      mockProducts = [];
      // Switch away from "Frequent" to trigger the non-frequent empty path
      // We need to first render, then change category
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText("Beverages")).toBeTruthy();
      });
      fireEvent.press(screen.getByText("Beverages"));
      await waitFor(() => {
        expect(screen.getByText("No products yet")).toBeTruthy();
      });
    });
  });

  // ═══ Welcome guide persistence ═════════════════════════════════════════════

  describe("Welcome guide persistence", () => {
    it("shows welcome guide modal on first visit", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText("Welcome to SuperMandi POS")).toBeTruthy();
        expect(screen.getByText("Got it, Start Billing →")).toBeTruthy();
      });
    });

    it("dismisses guide and persists dismissal to AsyncStorage", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText("Got it, Start Billing →")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByText("Got it, Start Billing →"));
      });

      // Guide should disappear
      await waitFor(() => {
        expect(screen.queryByText("Welcome to SuperMandi POS")).toBeNull();
      });

      // AsyncStorage.setItem should have been called with the guide key
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        "supermandi.guide.store-test-1.v1",
        "1"
      );
    });

    it("does NOT show guide when already dismissed", async () => {
      // Simulate previously dismissed
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === "supermandi.guide.store-test-1.v1") return Promise.resolve("1");
        return Promise.resolve(null);
      });
      render(<SellScreenV3 />);

      // Wait for render to settle (categories load)
      await waitFor(() => {
        expect(screen.getByText("Cart empty — tap product or scan barcode")).toBeTruthy();
      });
      // Guide should NOT be visible
      expect(screen.queryByText("Welcome to SuperMandi POS")).toBeNull();
    });
  });

  // ═══ Feature flag gated visibility ═════════════════════════════════════════

  describe("Feature flag gated visibility", () => {
    it("hides mic button when voiceEnabled=false", async () => {
      mockVoiceEnabled = false;
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText("Cart empty — tap product or scan barcode")).toBeTruthy();
      });
      // No mic/voice button should exist — check by accessibilityLabel
      expect(screen.queryByLabelText("Voice input")).toBeNull();
    });

    it("shows mic button when voiceEnabled=true", async () => {
      mockVoiceEnabled = true;
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText("Cart empty — tap product or scan barcode")).toBeTruthy();
      });
      expect(screen.getByLabelText("Voice input")).toBeTruthy();
    });

    it("hides category chips when categoryBrowsingEnabled=false", async () => {
      mockCategoryBrowsingEnabled = false;
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText("Cart empty — tap product or scan barcode")).toBeTruthy();
      });
      // Category chips should not be rendered
      expect(screen.queryByText("Frequent")).toBeNull();
      expect(screen.queryByText("Beverages")).toBeNull();
    });

    it("shows category chips when categoryBrowsingEnabled=true", async () => {
      mockCategoryBrowsingEnabled = true;
      render(<SellScreenV3 />);
      await waitFor(() => {
        // FALLBACK_CATEGORIES are shown before async getSellCategoryGroups resolves
        expect(screen.getByText("Frequent")).toBeTruthy();
      });
    });
  });

  // ═══ Category switching ════════════════════════════════════════════════════

  describe("Category switching", () => {
    it("switches to Beverages category and filters products", async () => {
      mockProducts = [
        { id: "p1", name: "Coke", priceMinor: 2000, currency: "INR", category: "Beverages", stock: 10 },
        { id: "p2", name: "Lays Classic", priceMinor: 1000, currency: "INR", category: "Snacks", stock: 5 },
        { id: "p3", name: "Thums Up", priceMinor: 2000, currency: "INR", category: "Beverages", stock: 8 },
      ];
      render(<SellScreenV3 />);

      await waitFor(() => {
        expect(screen.getByText("Beverages")).toBeTruthy();
      });

      fireEvent.press(screen.getByText("Beverages"));

      await waitFor(() => {
        expect(screen.getByText("Coke")).toBeTruthy();
        expect(screen.getByText("Thums Up")).toBeTruthy();
        // Snacks product should not be visible
        expect(screen.queryByText("Lays Classic")).toBeNull();
      });
    });

    it("loads frequent products from API when Frequent is selected", async () => {
      mockGetFrequentProducts.mockResolvedValue([
        { id: "fp1", name: "Amul Milk", sell_price: 2800, barcode: "8901234", category: "Dairy", current_stock: 20 },
      ]);
      render(<SellScreenV3 />);

      // Frequent is selected by default
      await waitFor(() => {
        expect(mockGetFrequentProducts).toHaveBeenCalled();
        expect(screen.getByText("Amul Milk")).toBeTruthy();
      });
    });
  });

  // ═══ Cart identity / add-to-cart ═══════════════════════════════════════════

  describe("Cart identity and add-to-cart", () => {
    it("tapping a tile calls addItem with barcode ?? id as identity", async () => {
      mockProducts = [
        { id: "p1", name: "Coke", priceMinor: 2000, currency: "INR", barcode: "8901234", category: "Beverages", stock: 10 },
      ];
      render(<SellScreenV3 />);

      // Switch to Beverages to see the product
      await waitFor(() => {
        expect(screen.getByText("Beverages")).toBeTruthy();
      });
      fireEvent.press(screen.getByText("Beverages"));

      await waitFor(() => {
        expect(screen.getByText("Coke")).toBeTruthy();
      });
      fireEvent.press(screen.getByText("Coke"));

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "8901234", // barcode ?? id → barcode takes priority
          name: "Coke",
        })
      );
    });

    it("shows cart strip with item count when items are in cart", async () => {
      mockCartItems = [
        { id: "p1", name: "Coke", priceMinor: 2000, quantity: 2, currency: "INR" },
      ];
      render(<SellScreenV3 />);

      await waitFor(() => {
        expect(screen.getByText("2 items")).toBeTruthy();
        expect(screen.getByText("PAY →")).toBeTruthy();
      });
    });

    it("shows singular 'item' for single quantity", async () => {
      mockCartItems = [
        { id: "p1", name: "Coke", priceMinor: 2000, quantity: 1, currency: "INR" },
      ];
      render(<SellScreenV3 />);

      await waitFor(() => {
        expect(screen.getByText("1 item")).toBeTruthy();
      });
    });

    it("tapping cart strip opens cart sheet", async () => {
      mockCartItems = [
        { id: "p1", name: "Coke", priceMinor: 2000, quantity: 1, currency: "INR" },
      ];
      render(<SellScreenV3 />);

      await waitFor(() => {
        expect(screen.getByLabelText("View cart")).toBeTruthy();
      });
      fireEvent.press(screen.getByLabelText("View cart"));

      await waitFor(() => {
        expect(screen.getByTestId("cart-sheet")).toBeTruthy();
      });
    });
  });

  // ═══ Navigation wiring ═════════════════════════════════════════════════════

  describe("Navigation wiring", () => {
    it("header menu button navigates to MORE tab", async () => {
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByTestId("header-menu-btn")).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId("header-menu-btn"));
      expect(mockParentNavigate).toHaveBeenCalledWith("MORE");
    });

    it("tapping search bar opens search overlay", async () => {
      // Dismiss guide so search bar is accessible
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === "supermandi.guide.store-test-1.v1") return Promise.resolve("1");
        return Promise.resolve(null);
      });
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByText(/Search product/)).toBeTruthy();
      });
      fireEvent.press(screen.getByText(/Search product/));

      await waitFor(() => {
        expect(screen.getByTestId("universal-search")).toBeTruthy();
      });
    });

    it("tapping scan button navigates to V3Scan", async () => {
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByLabelText("Scan barcode")).toBeTruthy();
      });
      fireEvent.press(screen.getByLabelText("Scan barcode"));
      expect(mockNavigate).toHaveBeenCalledWith("V3Scan");
    });

    it("tapping mic button shows voice overlay", async () => {
      mockVoiceEnabled = true;
      render(<SellScreenV3 />);
      await waitFor(() => {
        expect(screen.getByLabelText("Voice input")).toBeTruthy();
      });
      fireEvent.press(screen.getByLabelText("Voice input"));

      await waitFor(() => {
        expect(screen.getByTestId("voice-overlay")).toBeTruthy();
      });
    });
  });
});
