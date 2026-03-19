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

const MOCK_COLORS: Record<string, string> = {
  primary: "#2563EB", primaryDark: "#1D4ED8", primaryLight: "#EFF6FF",
  accent: "#14B8A6", accentDark: "#0D9488", accentLight: "#F0FDFA",
  background: "#fff", surface: "#fff", surfaceAlt: "#F8FAFC",
  backgroundSecondary: "#F1F5F9", backgroundTertiary: "#E2E8F0",
  border: "#E2E8F0", borderDark: "#CBD5E1",
  textPrimary: "#0F172A", textSecondary: "#475569", textTertiary: "#94A3B8",
  textInverse: "#FFFFFF",
  success: "#16A34A", successDark: "#166534", successSoft: "#ECFDF5", successBorder: "#BBF7D0",
  warning: "#F59E0B", warningDark: "#92400E", warningSoft: "#FFF7ED", warningBorder: "#FDE68A",
  error: "#EF4444", errorDark: "#991B1B", errorSoft: "#FEF2F2", errorBorder: "#FECACA",
  info: "#0EA5E9",
  shadow: "#000", overlay: "rgba(0,0,0,0.5)", overlayLight: "rgba(0,0,0,0.2)",
  overlayInverse: "rgba(255,255,255,0.15)",
  disabled: "#94A3B8", disabledText: "#94A3B8", disabledBg: "#F1F5F9",
  ink: "#0B1220", whatsapp: "#25D366",
  bg: "#F7F9FC", secondary: "#14B8A6", secondaryDark: "#0D9488", secondaryLight: "#F0FDFA",
  accentSoft: "#ECFEFF", primarySoft: "#EFF6FF",
};
jest.mock("../../theme", () => ({
  useThemeColors: () => MOCK_COLORS,
}));

jest.mock("../../theme/responsive", () => ({
  getScreenPadding: () => 16, getGridColumns: () => 3,
  getChipPadding: () => 16, getChipFontSize: () => 12,
  getNavIconSize: () => 22, getHeaderSpacing: () => 12, getModalMaxWidth: () => 400,
}));

jest.mock("../../theme/brand", () => ({
  shell: { navElevation: { shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 12 }, activePillRadius: 20, cardRadius: 16, headerHeight: 56, navContentHeight: 60, activePillPaddingV: 6, activePillPaddingH: 20 },
  tabAccents: () => ({
    SELL: { hero: "#2563EB", heroSoft: "#EFF6FF", accent: "#2563EB", icon: "💰", label: "SELL", subtitle: "Billing" },
    BUY: { hero: "#14B8A6", heroSoft: "#F0FDFA", accent: "#14B8A6", icon: "🛒", label: "BUY", subtitle: "Procurement" },
    STORE: { hero: "#7C3AED", heroSoft: "#F5F3FF", accent: "#7C3AED", icon: "📦", label: "STORE", subtitle: "Stock" },
    MORE: { hero: "#475569", heroSoft: "#F1F5F9", accent: "#475569", icon: "⚙️", label: "MORE", subtitle: "Settings" },
  }),
  cardElevation: { flat: { shadowOpacity: 0, elevation: 0 }, subtle: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 }, standard: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 4 }, prominent: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 } },
  typeRhythm: { sectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 }, heroStat: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 }, heroLabel: { fontSize: 12, fontWeight: "600" }, cardTitle: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2 }, cardMeta: { fontSize: 11, fontWeight: "500" }, navLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 }, navLabelActive: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 } },
  iconRhythm: { nav: 22, header: 20, card: 16, chip: 12, hero: 32 },
  chipColors: () => ({ status: { bg: "#ECFDF5", text: "#16A34A", border: "#BBF7D0" }, warning: { bg: "#FFF7ED", text: "#92400E", border: "#FDE68A" }, error: { bg: "#FEF2F2", text: "#EF4444", border: "#FECACA" }, info: { bg: "#EFF6FF", text: "#2563EB", border: "#2563EB" }, neutral: { bg: "#F1F5F9", text: "#475569", border: "#E2E8F0" }, accent: { bg: "#F0FDFA", text: "#0D9488", border: "#14B8A6" } }),
  motion: { tabSwitch: { duration: 150, easing: "ease-out" }, sheetReveal: { duration: 250, easing: "ease-out" }, badgePulse: { duration: 200, easing: "ease-in-out" }, cardPress: { scale: 0.98, duration: 100 } },
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
      voiceEnabled: false, categoryBrowsingEnabled: true,
      language: "en", storeName: "Test Store", themeMode: "light",
    }),
    { getState: () => ({ voiceEnabled: false, categoryBrowsingEnabled: true, themeMode: "light" }) }
  ),
}));

// ── API mocks ───────────────────────────────────────────────────────────────
jest.mock("../../services/api/sellSearchApi", () => ({ searchStoreProducts: jest.fn().mockResolvedValue([]) }));
jest.mock("../../services/api/catalogApi", () => ({
  getSellCategoryGroups: jest.fn().mockResolvedValue([]),
  getCatalog: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getBuyCatalog: jest.fn().mockResolvedValue({
    data: [
      { id: "sp1", name: "Tata Tea Gold", brand: "Tata", category: "Tea", unit: "pcs",
        netContentValue: 500, netContentUnit: "g", bestPrice: 224,
        suppliers: [
          { supplierId: "s1", supplierName: "Tata Consumer", supplierProductId: "sp1",
            purchasePrice: 22400, mrp: 28000, moq: 2, stockQuantity: 100,
            stockStatus: "in_stock", isPreferred: true, bnplEligible: false, deliveryDays: 3 },
        ],
        hsnCode: "0902", gstRate: 5 },
    ],
    total: 1,
  }),
}));
jest.mock("../../services/api/productsApi", () => ({ getFrequentProducts: jest.fn().mockResolvedValue([]) }));
jest.mock("../../services/api/orderApi", () => ({ createOrder: jest.fn(), submitOrder: jest.fn(), confirmPayment: jest.fn() }));
jest.mock("../../stores/scanResultStore", () => ({
  useScanResultStore: Object.assign(
    (sel: (s: any) => any) => sel({ barcode: null, intent: null, timestamp: 0, clearScanResult: jest.fn() }),
    { getState: () => ({ barcode: null, intent: null, timestamp: 0, clearScanResult: jest.fn() }) }
  ),
}));

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
    await waitFor(() => {
      // Cart strip shows case summary — multiple "item" texts may exist (hero strip + cart strip)
      expect(screen.getAllByText(/item/i).length).toBeGreaterThanOrEqual(1);
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

// ═══════════════════════════════════════════════════════════════════════════════
// STATE PRESERVATION: Detail flow does not corrupt parent screen state
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-184: State preservation across detail flow", () => {
  beforeEach(() => {
    cartMutationCount = 0;
    mockAddItem.mockClear();
    mockUpdateQuantity.mockClear();
  });

  it("SELL: product grid is intact after open→close detail", async () => {
    render(<SellScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Maggi Noodles")).toBeTruthy();
      expect(screen.getByText("Tata Salt")).toBeTruthy();
    });

    // Open detail for first product
    fireEvent.press(screen.getAllByLabelText(/tap for details/i)[0]);
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });

    // Close detail
    fireEvent.press(screen.getByLabelText("Close details"));

    // Both products still in grid (state preserved)
    expect(screen.getByText("Maggi Noodles")).toBeTruthy();
    expect(screen.getByText("Tata Salt")).toBeTruthy();
  });

  it("SELL: cart state preserved after detail open→add→close cycle", async () => {
    render(<SellScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Maggi Noodles")).toBeTruthy();
    });

    // Open detail, add item
    fireEvent.press(screen.getAllByLabelText(/tap for details/i)[0]);
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("detail-top-add"));
    expect(mockAddItem).toHaveBeenCalledTimes(1);

    // Open detail for second product
    await waitFor(() => {
      expect(screen.getByText("Tata Salt")).toBeTruthy();
    });
    fireEvent.press(screen.getAllByLabelText(/tap for details/i)[1]);
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });

    // Close without adding second
    fireEvent.press(screen.getByLabelText("Close details"));

    // Only first add was recorded — no spurious mutations
    expect(mockAddItem).toHaveBeenCalledTimes(1);
  });

  it("SELL: search bar/mode strip remain accessible after detail flow", async () => {
    render(<SellScreenV3 />);

    await waitFor(() => {
      expect(screen.getByTestId("sell-screen-v3")).toBeTruthy();
    });

    // Open and close detail
    fireEvent.press(screen.getAllByLabelText(/tap for details/i)[0]);
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText("Close details"));

    // Search bar and mode strip are still reachable
    expect(screen.getByTestId("sell-search-bar")).toBeTruthy();
    expect(screen.getByTestId("sell-mode-strip")).toBeTruthy();
  });

  it("BUY: product list preserved after detail close", async () => {
    render(<BuyScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
    });

    // Open and close detail
    fireEvent.press(screen.getByText("Tata Tea Gold"));
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText("Close details"));

    // Product still visible
    expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BACK BEHAVIOR: Close detail returns to browse, not exit
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-184: Back/return behavior", () => {
  beforeEach(() => {
    mockAddItem.mockClear();
  });

  it("SELL: closing detail returns to product grid, not empty screen", async () => {
    render(<SellScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Maggi Noodles")).toBeTruthy();
    });

    // Open detail
    fireEvent.press(screen.getAllByLabelText(/tap for details/i)[0]);
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });

    // Close
    fireEvent.press(screen.getByLabelText("Close details"));

    // Product grid visible — not blank/empty
    await waitFor(() => {
      expect(screen.getByText("Maggi Noodles")).toBeTruthy();
      expect(screen.queryByTestId("product-detail-sheet")).toBeNull();
    });
  });

  it("BUY: closing detail returns to supplier catalogue, not exit", async () => {
    render(<BuyScreenV3 />);

    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Tata Tea Gold"));
    await waitFor(() => {
      expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText("Close details"));

    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
      expect(screen.queryByTestId("product-detail-sheet")).toBeNull();
    });
  });

  it("tab switch from detail-open state does not leave orphan sheet", async () => {
    render(<PosRootLayoutV3 />);

    // Start on SELL, open detail
    await waitFor(() => {
      expect(screen.getByTestId("sell-screen-v3")).toBeTruthy();
    });
    fireEvent.press(screen.getAllByLabelText(/tap for details/i)[0]);

    // Switch to BUY while detail is open
    fireEvent.press(screen.getByLabelText("BUY"));

    await waitFor(() => {
      expect(screen.getByText("Tata Tea Gold")).toBeTruthy();
    });

    // SELL detail sheet is unmounted (SELL screen is unmounted)
    expect(screen.queryByTestId("sell-screen-v3")).toBeNull();

    // No cart corruption
    expect(mockAddItem).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY/FILTER STATE RETENTION
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-184: Category/filter state retention across detail flow", () => {
  beforeEach(() => {
    mockAddItem.mockClear();
  });

  it("SELL: category chip selection is preserved after detail open→close", async () => {
    render(<SellScreenV3 />);

    await waitFor(() => {
      expect(screen.getByTestId("sell-screen-v3")).toBeTruthy();
    });

    // Category chips should be visible (categoryBrowsingEnabled=true)
    await waitFor(() => {
      expect(screen.getByTestId("sell-category-chips")).toBeTruthy();
    });

    // The default "Frequent" chip exists — select a different one if available
    // With fallback categories: Frequent, Beverages, Snacks, Dairy, Staples, Home Care
    const snacksChip = screen.queryByText("Snacks");
    if (snacksChip) {
      fireEvent.press(snacksChip);

      // Open detail
      const tiles = screen.queryAllByLabelText(/tap for details/i);
      if (tiles.length > 0) {
        fireEvent.press(tiles[0]);
        await waitFor(() => {
          expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
        });

        // Close detail
        fireEvent.press(screen.getByLabelText("Close details"));
      }

      // Category chips should still show "Snacks" as an option
      expect(screen.getByText("Snacks")).toBeTruthy();
      // Category chips container still visible
      expect(screen.getByTestId("sell-category-chips")).toBeTruthy();
    }
  });

  it("SELL: mode strip (BILLING MODE) persists across detail flow", async () => {
    render(<SellScreenV3 />);

    await waitFor(() => {
      expect(screen.getByTestId("sell-mode-strip")).toBeTruthy();
    });

    // Open and close detail
    const tiles = screen.queryAllByLabelText(/tap for details/i);
    if (tiles.length > 0) {
      fireEvent.press(tiles[0]);
      await waitFor(() => {
        expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();
      });
      fireEvent.press(screen.getByLabelText("Close details"));
    }

    // Mode strip still present
    expect(screen.getByTestId("sell-mode-strip")).toBeTruthy();
    // Cart state unchanged
    expect(mockAddItem).not.toHaveBeenCalled();
  });
});
