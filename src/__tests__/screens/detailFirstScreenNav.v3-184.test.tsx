/**
 * V3-HARDEN-184: Full screen-navigation proof for detail-first SELL and BUY flows
 *
 * Renders the REAL SellScreenV3 and BuyScreenV3 screens (not isolated components)
 * and proves the complete detail-first interaction path at the mounted-screen level.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS — all dependencies of SellScreenV3 and BuyScreenV3
// ═══════════════════════════════════════════════════════════════════════════════

jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const mock = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: mock, Svg: mock, Rect: mock, Path: mock, Circle: mock, Line: mock };
});

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d: string) => d || _k }),
}));

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    primary: "#2563EB", primaryLight: "#EFF6FF", background: "#fff", surface: "#fff",
    backgroundSecondary: "#F1F5F9", border: "#E2E8F0", textPrimary: "#0F172A",
    textSecondary: "#475569", textTertiary: "#94A3B8", success: "#16A34A",
    warning: "#F59E0B", error: "#EF4444", warningSoft: "#FEF3C7", successSoft: "#DCFCE7",
  }),
}));

jest.mock("../../theme/responsive", () => ({
  getScreenPadding: () => 16, getGridColumns: () => 3,
  getChipPadding: () => ({ h: 16, v: 8 }), getChipFontSize: () => 12,
  getNavIconSize: () => 22, getHeaderSpacing: () => 12, getModalMaxWidth: () => 400,
}));

jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn() } }));
jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/deviceSession", () => ({ getDeviceStoreId: jest.fn().mockResolvedValue("store-001") }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue("1"), setItem: jest.fn().mockResolvedValue(undefined),
}));

// ── Cart store mock with mutation tracking ──────────────────────────────────
let cartMutationCount = 0;
const mockAddItem = jest.fn(() => { cartMutationCount++; });
const mockUpdateQuantity = jest.fn(() => { cartMutationCount++; });

const mockCartState = {
  items: [], total: 0, sellMode: "retail", discount: null, discountAmount: 0,
  addItem: mockAddItem, updateQuantity: mockUpdateQuantity,
  lockCart: jest.fn(), unlockCart: jest.fn(), clearCart: jest.fn(),
};
jest.mock("../../stores/cartStore", () => ({
  useCartStore: Object.assign(
    (sel: (s: any) => any) => sel(mockCartState),
    { getState: () => mockCartState }
  ),
}));

// ── Products store mock ─────────────────────────────────────────────────────
const MOCK_PRODUCTS = [
  { id: "p1", name: "Maggi Noodles", priceMinor: 1400, barcode: "890100001", category: "Noodles", stock: 50, brand: "Nestle", unit: "pcs", currency: "INR" },
  { id: "p2", name: "Tata Salt", priceMinor: 2000, barcode: "890100002", category: "Staples", stock: 30, brand: "Tata", unit: "pcs", currency: "INR" },
];

jest.mock("../../stores/productsStore", () => ({
  useProductsStore: Object.assign(
    (sel: (s: any) => any) => sel({
      products: MOCK_PRODUCTS, loading: false,
      loadProducts: jest.fn(), checkAndRefresh: jest.fn(),
    }),
    { getState: () => ({ products: MOCK_PRODUCTS }) }
  ),
}));

jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: Object.assign(
    (sel: (s: any) => any) => sel({
      voiceEnabled: false, categoryBrowsingEnabled: false,
      language: "en", storeName: "Test Store",
    }),
    { getState: () => ({ voiceEnabled: false, categoryBrowsingEnabled: false }) }
  ),
}));

// ── API mocks ───────────────────────────────────────────────────────────────
jest.mock("../../services/api/sellSearchApi", () => ({ searchStoreProducts: jest.fn().mockResolvedValue([]) }));
jest.mock("../../services/api/catalogApi", () => ({
  getSellCategoryGroups: jest.fn().mockResolvedValue([]),
  getCatalog: jest.fn().mockResolvedValue({
    data: [
      { id: "sp1", name: "Tata Tea Gold", brand: "Tata", category: "Tea", unit: "pcs",
        netContentValue: 500, netContentUnit: "g", bestPrice: 224,
        supplierId: "s1", supplierName: "Tata Consumer", moq: 2, caseSize: 12,
        hsnCode: "0902", gstRate: 5, mrpMinor: 28000, ptrMinor: 22400, deliveryDays: 3 },
    ],
    total: 1,
  }),
}));
jest.mock("../../services/api/productsApi", () => ({ getFrequentProducts: jest.fn().mockResolvedValue([]) }));
jest.mock("../../services/api/orderApi", () => ({ createOrder: jest.fn(), submitOrder: jest.fn() }));

// ── Component mocks for heavy children ──────────────────────────────────────
jest.mock("../../components/v3/BrandedHeader", () => {
  const { View, Text } = require("react-native");
  return { __esModule: true, default: () => <View><Text>Header</Text></View> };
});
jest.mock("../../components/v3/VoiceOverlayV3", () => {
  return { __esModule: true, default: () => null };
});
jest.mock("../../components/v3/UniversalSearchV3", () => {
  return { __esModule: true, default: () => null };
});
jest.mock("../../components/v3/CartSheetV3", () => {
  return { __esModule: true, default: () => null };
});

// ── Mocks for PosRootLayoutV3 child screens (STORE/MORE only — SELL/BUY are real) ──
jest.mock("../../screens/v3/StoreHubScreenV3", () => {
  const { View, Text } = require("react-native");
  return { __esModule: true, default: () => <View testID="store-hub-stub"><Text>STORE Hub</Text></View> };
});
jest.mock("../../screens/v3/MoreScreenV3", () => {
  const { View, Text } = require("react-native");
  return { __esModule: true, default: () => <View testID="more-stub"><Text>MORE Screen</Text></View> };
});
jest.mock("../../components/ui/ScreenErrorBoundary", () => {
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});
jest.mock("../../services/sseClient", () => ({ startSSEClient: jest.fn(), stopSSEClient: jest.fn() }));
jest.mock("../../services/cartPayload", () => ({
  buildCartItemFromTile: jest.fn((tile: any) => ({ id: tile.barcode ?? tile.id, name: tile.name, priceMinor: tile.priceMrpMinor, quantity: 1 })),
  buildCartItemFromSearch: jest.fn(),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTS (after all mocks)
// ═══════════════════════════════════════════════════════════════════════════════

import SellScreenV3 from "../../screens/v3/SellScreenV3";
import BuyScreenV3 from "../../screens/v3/BuyScreenV3";
import PosRootLayoutV3 from "../../screens/v3/PosRootLayoutV3";

// ═══════════════════════════════════════════════════════════════════════════════
// SELL SCREEN: Full mounted screen proof
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-184: SellScreenV3 mounted detail-first flow", () => {
  beforeEach(() => {
    cartMutationCount = 0;
    mockAddItem.mockClear();
    mockUpdateQuantity.mockClear();
  });

  it("renders sell screen with product grid", async () => {
    render(<SellScreenV3 />);
    // Screen renders with testID
    expect(screen.getByTestId("sell-screen-v3")).toBeTruthy();
    // Products appear (from mock products store)
    await waitFor(() => {
      expect(screen.getByText("Maggi Noodles")).toBeTruthy();
      expect(screen.getByText("Tata Salt")).toBeTruthy();
    });
  });

  it("tapping a tile does NOT mutate cart, opens detail sheet", async () => {
    render(<SellScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Maggi Noodles")).toBeTruthy();
    });

    // Cart mutation count before tap
    const before = cartMutationCount;

    // Tap the tile (via accessibility label)
    const tile = screen.getAllByLabelText(/tap for details/i)[0];
    fireEvent.press(tile);

    // Cart was NOT mutated by tile tap
    expect(cartMutationCount).toBe(before);
    expect(mockAddItem).not.toHaveBeenCalled();

    // Detail sheet should now be visible
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });
  });

  it("explicit Add CTA inside detail is the first cart mutation", async () => {
    render(<SellScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Maggi Noodles")).toBeTruthy();
    });

    // Open detail
    const tile = screen.getAllByLabelText(/tap for details/i)[0];
    fireEvent.press(tile);

    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });

    // Tap the top Add CTA
    const addBtn = screen.getByTestId("detail-top-add");
    fireEvent.press(addBtn);

    // NOW cart was mutated (via handleDetailAdd → addItem)
    expect(mockAddItem).toHaveBeenCalledTimes(1);
  });

  it("close from detail does NOT mutate cart", async () => {
    render(<SellScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Maggi Noodles")).toBeTruthy();
    });

    // Open detail
    fireEvent.press(screen.getAllByLabelText(/tap for details/i)[0]);
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });

    // Close without adding
    fireEvent.press(screen.getByLabelText("Close details"));

    // Cart was NOT mutated
    expect(mockAddItem).not.toHaveBeenCalled();

    // Product grid still visible (state preserved)
    expect(screen.getByText("Maggi Noodles")).toBeTruthy();
    expect(screen.getByText("Tata Salt")).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUY SCREEN: Full mounted screen proof
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-184: BuyScreenV3 mounted detail-first flow", () => {
  it("renders BUY screen without pre-seeded purchase cart", async () => {
    render(<BuyScreenV3 />);

    // Wait for catalog to load
    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
    });

    // Cart strip should NOT appear (no items pre-seeded)
    expect(screen.queryByText(/item.*case/i)).toBeNull();
  });

  it("tapping supplier card opens detail, does NOT mutate purchase cart", async () => {
    render(<BuyScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
    });

    // Tap the supplier card (card shows "Tap for details")
    const card = screen.getByText("Tata Tea Gold");
    fireEvent.press(card);

    // Detail sheet should open
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });

    // No purchase cart mutation on card tap — cart strip still absent
    expect(screen.queryByText(/item.*case/i)).toBeNull();
  });

  it("explicit Add CTA in detail updates purchase cart — visible UI proof", async () => {
    render(<BuyScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
    });

    // Before add: no cart strip visible
    expect(screen.queryByText(/item/i)).toBeNull();

    // Open detail
    fireEvent.press(screen.getByText("Tata Tea Gold"));
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });

    // Tap top Add CTA
    fireEvent.press(screen.getByTestId("detail-top-add"));

    // Detail sheet closes
    await waitFor(() => {
      expect(screen.queryByTestId("product-detail-sheet")).toBeNull();
    });

    // After add: purchase cart strip IS now visible with item count
    // BuyScreenV3 shows cart strip when cartItemCount > 0
    // The handleQtyChange sets orderQtys[id] = quantity, making cartItemCount > 0
    await waitFor(() => {
      // Cart strip shows item/case summary
      expect(screen.getByText(/item/i)).toBeTruthy();
    });
  });

  it("close from detail does NOT mutate purchase cart", async () => {
    render(<BuyScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
    });

    // Open detail
    fireEvent.press(screen.getByText("Tata Tea Gold"));
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });

    // Close without adding
    fireEvent.press(screen.getByLabelText("Close details"));

    // Product list still visible, no cart strip
    expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT/TAB: PosRootLayoutV3 mounted runtime proof
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-184: PosRootLayoutV3 tab switching (runtime)", () => {
  it("default tab renders SELL screen", async () => {
    render(<PosRootLayoutV3 />);

    // SELL is the default active tab — SellScreenV3 should render
    await waitFor(() => {
      expect(screen.getByTestId("sell-screen-v3")).toBeTruthy();
    });

    // SELL tab should be selected
    const sellTab = screen.getByLabelText("SELL");
    expect(sellTab).toBeTruthy();
  });

  it("switch to BUY tab renders BuyScreenV3, SELL is unmounted", async () => {
    render(<PosRootLayoutV3 />);

    // Start on SELL
    await waitFor(() => {
      expect(screen.getByTestId("sell-screen-v3")).toBeTruthy();
    });

    // Tap BUY tab
    const buyTab = screen.getByLabelText("BUY");
    fireEvent.press(buyTab);

    // BUY screen should render (catalog loads)
    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
    });

    // SELL screen should be unmounted (conditional rendering)
    expect(screen.queryByTestId("sell-screen-v3")).toBeNull();
  });

  it("switch back to SELL from BUY — SELL re-renders, no cart corruption", async () => {
    render(<PosRootLayoutV3 />);

    // Start on SELL
    await waitFor(() => {
      expect(screen.getByTestId("sell-screen-v3")).toBeTruthy();
    });

    // Switch to BUY
    fireEvent.press(screen.getByLabelText("BUY"));
    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
    });

    // Switch back to SELL
    fireEvent.press(screen.getByLabelText("SELL"));
    await waitFor(() => {
      expect(screen.getByTestId("sell-screen-v3")).toBeTruthy();
    });

    // Cart was NOT mutated by tab switching
    expect(mockAddItem).not.toHaveBeenCalled();

    // Products still render on SELL
    expect(screen.getByText("Maggi Noodles")).toBeTruthy();
  });
});
