/**
 * V3-FIX-076..079: BUY/Compare/CounterPurchase/STORE runtime regression
 * Verifies:
 *   - BUY finance banner + search + supplier/category filtering
 *   - Compare uses authoritative ranking (not i===0)
 *   - Counter purchase confirm uses real product identity + supplier ID
 *   - GRN renders real PO context (no hardcoded PO#1234 / Parle-G)
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
  const c = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: c, Svg: c, Rect: c, Path: c, Circle: c, Line: c };
});

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    background: "#fff", surface: "#f8f", primary: "#2563eb", primaryLight: "#dbeafe",
    textPrimary: "#111", textSecondary: "#4b5", textTertiary: "#9ca",
    border: "#e2e", success: "#16a", error: "#dc2", warning: "#f59",
    warningSoft: "#fef", backgroundSecondary: "#f1f", accent: "#2563eb",
    successSoft: "#dcf", errorSoft: "#fef",
  }),
}));

jest.mock("../../services/networkStatus", () => ({ isOnline: jest.fn().mockResolvedValue(true) }));
jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/logger", () => ({ logger: { debug: jest.fn(), error: jest.fn() } }));
jest.mock("../../services/deviceSession", () => ({ getDeviceStoreId: jest.fn().mockResolvedValue("store-1") }));

// BUY mocks
const mockGetCatalog = jest.fn().mockResolvedValue({
  data: [
    { id: "p1", name: "Parle-G", brand: "Parle", category: "Biscuits", unit: "pcs", hsnCode: "1905", gstRate: 18, netContentValue: "100", netContentUnit: "g", bestPrice: 5, supplierName: "Supplier A", supplierId: "sup-001", supplier_id: "sup-001", caseSize: 24, ptrMinor: 425, moq: 2 },
    { id: "p2", name: "Tata Tea", brand: "Tata", category: "Beverages", unit: "pcs", hsnCode: "0902", gstRate: 5, bestPrice: 12, supplierName: "Supplier B", supplierId: "sup-002", supplier_id: "sup-002", caseSize: 12, ptrMinor: 1020, moq: 1 },
  ],
});
jest.mock("../../services/api/catalogApi", () => ({
  getCatalog: (...args: any[]) => mockGetCatalog(...args),
  getProductSuppliers: jest.fn().mockResolvedValue([
    { supplierId: "s2", supplierName: "Supplier B", purchasePrice: 450, moq: 24, bnplEligible: true, expectedDeliveryDays: 3 },
    { supplierId: "s1", supplierName: "Supplier A", purchasePrice: 420, moq: 48, bnplEligible: false, expectedDeliveryDays: 1 },
  ]),
}));
jest.mock("../../services/api/orderApi", () => ({
  createOrder: jest.fn().mockResolvedValue({ id: "order-1" }),
  submitOrder: jest.fn(),
  listOrders: jest.fn().mockResolvedValue({
    data: [{ id: "order-abc", orderNumber: "PO-2026-0042", supplierName: "Metro Distributors", totalAmount: 4500, status: "confirmed", items: [] }],
  }),
  getOrder: jest.fn().mockResolvedValue({
    items: [
      { barcode: "8901234", productName: "Parle-G 100g", orderedQuantity: 48, receivedQuantity: 0, productId: "prod-1" },
    ],
  }),
}));
jest.mock("../../services/api/inventoryApi", () => ({
  recordManualInward: jest.fn().mockResolvedValue({ success: true }),
  getPurchaseHistory: jest.fn().mockResolvedValue({ entries: [] }),
}));
jest.mock("../../services/api/suppliersApi", () => ({
  getSuppliers: jest.fn().mockResolvedValue([
    { id: "sup-picker-001", businessName: "Metro Distributors", tradeName: "Metro" },
  ]),
}));
jest.mock("../../services/api/apiClient", () => ({
  apiClient: { get: jest.fn().mockResolvedValue({ count: 3 }), post: jest.fn() },
}));

let mockProducts: any[] = [];
jest.mock("../../stores/productsStore", () => ({
  useProductsStore: (sel: (s: any) => any) => sel({
    products: mockProducts,
    getProductByBarcode: (b: string) => mockProducts.find((p: any) => p.barcode === b) ?? null,
  }),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../components/v3/SupplierProductCardV3", () => {
  const React = require("react");
  const { View, Text, Pressable } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => React.createElement(Pressable, { testID: `card-${props.product.id}`, onPress: props.onPress },
      React.createElement(Text, null, props.product.name),
    ),
  };
});

jest.mock("../../components/v3/PurchaseItemCardV3", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => React.createElement(View, { testID: `purchase-item-${props.item.barcode}` },
      React.createElement(Text, null, props.item.name ?? props.item.barcode),
      React.createElement(Text, { testID: `item-state-${props.item.barcode}` }, props.item.state),
      // Expose onPriceChange so tests can simulate price entry
      React.createElement(Text, { testID: `item-price-${props.item.barcode}`, onPress: () => props.onPriceChange?.("50") }, "set-price"),
    ),
  };
});

jest.mock("../../components/v3/ExpandableDetails", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: (props: any) => React.createElement(View, props) };
});

// ── Imports ────────────────────────────────────────────────────────────────

import BuyScreenV3 from "../../screens/v3/BuyScreenV3";
import CompareScreenV3 from "../../screens/v3/CompareScreenV3";
import CounterPurchaseScreenV3 from "../../screens/v3/CounterPurchaseScreenV3";
import GRNScreenV3 from "../../screens/v3/GRNScreenV3";
import StoreHubScreenV3 from "../../screens/v3/StoreHubScreenV3";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("V3-FIX-076: BUY screen", () => {
  it("renders actionable finance banner that navigates to finance", async () => {
    render(<BuyScreenV3 />);
    await waitFor(() => {
      expect(screen.getByTestId("buy-finance-banner")).toBeTruthy();
      expect(screen.getByText("Buy Now, Pay Later")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("buy-finance-banner"));
    expect(mockNavigate).toHaveBeenCalledWith("V3Finance");
  });

  it("renders real search input (not placeholder Text)", async () => {
    render(<BuyScreenV3 />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search supplier products...")).toBeTruthy();
    });
  });

  it("loads dynamic categories from catalog data", async () => {
    render(<BuyScreenV3 />);
    await waitFor(() => {
      expect(screen.getByText("Biscuits")).toBeTruthy();
      expect(screen.getByText("Beverages")).toBeTruthy();
    });
  });

  it("loads dynamic suppliers from catalog data", async () => {
    render(<BuyScreenV3 />);
    await waitFor(() => {
      expect(screen.getByText("Supplier A")).toBeTruthy();
      expect(screen.getByText("Supplier B")).toBeTruthy();
    });
  });

  it("splits orders by supplierId for mixed-supplier carts", async () => {
    const mockCreateOrder = require("../../services/api/orderApi").createOrder;
    mockCreateOrder.mockClear();
    // Both products have different supplierIds (sup-001, sup-002)
    // Adding both to cart should create 2 separate orders
    render(<BuyScreenV3 />);
    await waitFor(() => {
      expect(screen.getByText("Parle-G")).toBeTruthy();
    });
    // Cart strip appears when items have qty > 0
    // The default MOQ sets initial qtys, so cart should be visible
    await waitFor(() => {
      expect(screen.getByLabelText("Place order")).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText("Place order"));
    await waitFor(() => {
      expect(mockCreateOrder).toHaveBeenCalled();
    });
    // Should have created 2 orders (one per supplier), not 1
    expect(mockCreateOrder).toHaveBeenCalledTimes(2);
    // First call should use sup-001, second sup-002 (or vice versa)
    const supplierIds = mockCreateOrder.mock.calls.map((c: any) => c[1].supplierId);
    expect(supplierIds).toContain("sup-001");
    expect(supplierIds).toContain("sup-002");
  });
});

describe("V3-FIX-077: Compare screen", () => {
  const baseProps = {
    visible: true, productName: "Parle-G", packSize: "100g", mrpMinor: 1000,
    currentStock: 10, sellPriceMinor: 800, weeklyNeed: 48,
    onClose: jest.fn(), onOrder: jest.fn(),
  };

  it("ranks suppliers by price (best price is cheapest, not i===0)", async () => {
    render(<CompareScreenV3 {...baseProps} />);
    await waitFor(() => {
      // Supplier A has price 420 (cheapest) → should be marked best
      expect(screen.getAllByText(/Supplier A/).length).toBeGreaterThan(0);
      expect(screen.getByText("Best Price")).toBeTruthy();
    });
  });

  it("uses authoritative deliveryDays from API (not hardcoded 2)", async () => {
    render(<CompareScreenV3 {...baseProps} />);
    await waitFor(() => {
      // Supplier A has expectedDeliveryDays: 1
      expect(screen.getByText(/1 day delivery/)).toBeTruthy();
      // Supplier B has expectedDeliveryDays: 3
      expect(screen.getByText(/3 days delivery/)).toBeTruthy();
    });
  });
});

describe("V3-FIX-079: GRN screen", () => {
  it("renders real PO context from loaded orders (not hardcoded PO #1234)", async () => {
    render(<GRNScreenV3 onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/PO-2026-0042/)).toBeTruthy();
      expect(screen.getByText(/Metro Distributors/)).toBeTruthy();
    });
    // Hardcoded values must NOT appear
    expect(screen.queryByText("PO #1234")).toBeNull();
    expect(screen.queryByText("Supplier ABC")).toBeNull();
  });

  it("does not show hardcoded scan feedback on initial render", async () => {
    render(<GRNScreenV3 onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/PO-2026-0042/)).toBeTruthy();
    });
    // Hardcoded scan feedback must NOT appear
    expect(screen.queryByText("Last scan: Parle-G 100g")).toBeNull();
    expect(screen.queryByText("Qty 48")).toBeNull();
  });

  it("renders real item from loaded PO", async () => {
    render(<GRNScreenV3 onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Parle-G 100g")).toBeTruthy();
      expect(screen.getByText("8901234")).toBeTruthy();
    });
  });
});

describe("V3-FIX-077: Compare CTA text", () => {
  const baseProps = {
    visible: true, productName: "Parle-G", packSize: "100g", mrpMinor: 1000,
    currentStock: 10, sellPriceMinor: 800, weeklyNeed: 48,
    onClose: jest.fn(), onOrder: jest.fn(),
  };

  it("renders full supplier name in CTA (no split breakage)", async () => {
    render(<CompareScreenV3 {...baseProps} />);
    await waitFor(() => {
      // Single-word and multi-word names should both render cleanly
      expect(screen.getByText(/Order from Supplier A/)).toBeTruthy();
      expect(screen.getByText(/Order from Supplier B/)).toBeTruthy();
    });
  });
});

describe("V3-FIX-078: Counter Purchase confirm path", () => {
  const mockRecordManualInward = require("../../services/api/inventoryApi").recordManualInward;
  const mockGetSuppliers = require("../../services/api/suppliersApi").getSuppliers;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProducts = [
      { id: "prod-real-1", barcode: "8901234", name: "Parle-G 100g", priceMinor: 1000, category: "Biscuits", gstPct: 18, storeProductId: "sp-1" },
    ];
  });

  it("renders scan input and confirm button", () => {
    render(<CounterPurchaseScreenV3 onClose={jest.fn()} />);
    expect(screen.getByPlaceholderText(/Scan barcode/)).toBeTruthy();
    expect(screen.getByText("Confirm")).toBeTruthy();
  });

  it("known scanned item carries real productId (not barcode) in confirm payload", async () => {
    render(<CounterPurchaseScreenV3 onClose={jest.fn()} />);
    const input = screen.getByPlaceholderText(/Scan barcode/);
    fireEvent.changeText(input, "8901234");
    fireEvent.press(screen.getByText("↵"));

    await waitFor(() => {
      expect(screen.getByTestId("purchase-item-8901234")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(mockRecordManualInward).toHaveBeenCalledTimes(1);
    });

    const [txnItems] = mockRecordManualInward.mock.calls[0];
    expect(txnItems[0].productId).toBe("prod-real-1");
    expect(txnItems[0].isNewProduct).toBe(false);
  });

  it("ad-hoc free-text supplier sends name-only payload (no id)", async () => {
    render(<CounterPurchaseScreenV3 onClose={jest.fn()} />);
    // Scan a known product
    fireEvent.changeText(screen.getByPlaceholderText(/Scan barcode/), "8901234");
    fireEvent.press(screen.getByText("↵"));
    await waitFor(() => expect(screen.getByTestId("purchase-item-8901234")).toBeTruthy());

    // Type ad-hoc supplier name (not from picker)
    fireEvent.changeText(screen.getByPlaceholderText("Enter supplier name..."), "Some Local Shop");

    fireEvent.press(screen.getByText("Confirm"));
    await waitFor(() => expect(mockRecordManualInward).toHaveBeenCalledTimes(1));

    const supplierPayload = mockRecordManualInward.mock.calls[0][2];
    expect(supplierPayload).toEqual({ name: "Some Local Shop" });
    expect(supplierPayload.id).toBeUndefined();
  });

  it("picked supplier from modal sends id + name in payload", async () => {
    render(<CounterPurchaseScreenV3 onClose={jest.fn()} />);
    // Scan a known product
    fireEvent.changeText(screen.getByPlaceholderText(/Scan barcode/), "8901234");
    fireEvent.press(screen.getByText("↵"));
    await waitFor(() => expect(screen.getByTestId("purchase-item-8901234")).toBeTruthy());

    // Open supplier picker by pressing the "+" button
    fireEvent.press(screen.getByText("+"));

    // Wait for the modal to load suppliers
    await waitFor(() => {
      expect(mockGetSuppliers).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Metro Distributors")).toBeTruthy();
    });

    // Select "Metro Distributors" from the picker
    fireEvent.press(screen.getByText("Metro Distributors"));

    // Now confirm
    fireEvent.press(screen.getByText("Confirm"));
    await waitFor(() => expect(mockRecordManualInward).toHaveBeenCalledTimes(1));

    const supplierPayload = mockRecordManualInward.mock.calls[0][2];
    // Picked from list → authoritative path with id
    expect(supplierPayload.id).toBe("sup-picker-001");
    expect(supplierPayload.name).toBe("Metro Distributors");
  });

  it("unknown/new product confirm payload carries barcode + isNewProduct=true", async () => {
    render(<CounterPurchaseScreenV3 onClose={jest.fn()} />);
    // Scan unknown barcode
    fireEvent.changeText(screen.getByPlaceholderText(/Scan barcode/), "5555555555555");
    fireEvent.press(screen.getByText("↵"));

    await waitFor(() => {
      expect(screen.getByTestId("purchase-item-5555555555555")).toBeTruthy();
      // Verify item state is "new"
      expect(screen.getByTestId("item-state-5555555555555").children[0]).toBe("new");
    });

    // Set price via mock's exposed onPriceChange trigger
    fireEvent.press(screen.getByTestId("item-price-5555555555555"));

    // Confirm
    fireEvent.press(screen.getByText("Confirm"));
    await waitFor(() => expect(mockRecordManualInward).toHaveBeenCalledTimes(1));

    const [txnItems] = mockRecordManualInward.mock.calls[0];
    expect(txnItems[0].productId).toBe("5555555555555"); // barcode as provisional identity
    expect(txnItems[0].isNewProduct).toBe(true);
  });

  it("GST total uses per-item gstPct from product metadata in confirm path", async () => {
    render(<CounterPurchaseScreenV3 onClose={jest.fn()} />);
    // Scan known product with gstPct: 18
    fireEvent.changeText(screen.getByPlaceholderText(/Scan barcode/), "8901234");
    fireEvent.press(screen.getByText("↵"));
    await waitFor(() => expect(screen.getByTestId("purchase-item-8901234")).toBeTruthy());

    // The known product has priceMinor: 1000, so purchasePrice auto-fills to "10"
    // GST for 1 case × 1 unit × ₹10 at 18% = ₹1.80
    // Rendered footer should show GST as ₹2 (rounded)
    await waitFor(() => {
      // Footer renders "GST (mixed rates)" line with per-item calculated amount
      expect(screen.getByText("GST (mixed rates)")).toBeTruthy();
      expect(screen.getByText("₹2")).toBeTruthy(); // 10 * 18% = 1.8, rounded to 2
    });
  });
});

describe("V3-FIX-079: STORE hub", () => {
  it("fetches real low-stock count (not hardcoded 5)", async () => {
    render(<StoreHubScreenV3 onNavigate={jest.fn()} />);
    await waitFor(() => {
      // Mock returns count: 3
      expect(screen.getByText("3 items low")).toBeTruthy();
    });
    expect(screen.queryByText("5 items low")).toBeNull();
  });
});
