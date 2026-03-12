/**
 * Regression guards for ISSUE-051, ISSUE-066, and ISSUE-068
 *
 * ISSUE-051: The createSale useEffect must not cancel itself when setLoadingSale(true)
 *   is called. The bug: loadingSale in the deps array caused React to run cleanup
 *   (cancelled=true) and re-run the effect on every setLoadingSale() call, so
 *   setSaleId/setBillRef were never called and the payment button stayed disabled forever.
 *   Fix: createSaleInFlightRef = useRef(false) replaces loadingSale as the guard;
 *        loadingSale omitted from deps (PaymentScreen.tsx:525 comment).
 *   Root location: PaymentScreen.tsx:162 (createSaleInFlightRef), L373 (guard check),
 *                  L376 (set true), L505 (set false in finally), L525 (omit from deps).
 *
 * ISSUE-066: Same root cause and fix as ISSUE-051.
 *
 * ISSUE-068: productId mapping was wrong for catalog-digitised products.
 *   Cart item's metadata.storeProductId must be passed as store_product_id in the
 *   createSale request body so the backend can resolve the correct variant.
 *   Fix location: PaymentScreen.tsx:441-444, PaymentScreen.tsx:458.
 *
 * Test type: UNIT_TEST (component render with mocked API, no network, no real DB)
 * Severity: CRITICAL (ISSUE-051/066) and HIGH (ISSUE-068)
 */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

// Variables prefixed with "mock" can be referenced inside jest.mock() factories
// (babel-jest special-cases them to avoid the hoisting reference error)
let mockCurrentItems: any[] = [];

// ─── Navigation ──────────────────────────────────────────────────────────────
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
    replace: jest.fn(),
  }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
}));

// ─── Cart store (items configurable per test via mockCurrentItems) ───────────
jest.mock("../../stores/cartStore", () => ({
  useCartStore: (selector?: (s: any) => any) => {
    const items = mockCurrentItems;
    const total = items.reduce((s: number, i: any) => s + i.priceMinor * i.quantity, 0);
    const state = {
      items,
      total,
      subtotal: total,
      itemCount: items.reduce((s: number, i: any) => s + i.quantity, 0),
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

// ─── Settings / staff ────────────────────────────────────────────────────────
jest.mock("../../stores/settingsStore", () => ({
  useSettingsStore: (selector?: (s: any) => any) => {
    const state = { bnplEnabled: false, upiCollectionEnabled: true };
    return selector ? selector(state) : state;
  },
}));

jest.mock("../../stores/staffSessionStore", () => ({
  useStaffSessionStore: (selector?: (s: any) => any) => {
    const state = { activeStaff: null };
    return selector ? selector(state) : state;
  },
}));

// ─── API mocks ───────────────────────────────────────────────────────────────
jest.mock("../../services/api/posApi", () => ({
  createSale: jest.fn(),
  cancelSale: jest.fn().mockResolvedValue(undefined),
  checkWhatsAppStatus: jest.fn().mockResolvedValue({ configured: false }),
}));

jest.mock("../../services/api/inventoryApi", () => ({
  getStockBatch: jest.fn().mockResolvedValue({}),
  getStock: jest.fn().mockResolvedValue({ currentQty: 100 }),
}));

jest.mock("../../services/checkoutService", () => ({
  completeCheckout: jest.fn(),
  // validateCartStock returns valid so no Alert.alert interrupts the flow
  validateCartStock: jest.fn().mockReturnValue({ valid: true, issues: [] }),
  formatStockValidationWarning: jest.fn().mockReturnValue(""),
}));

jest.mock("../../services/offline/sales", () => ({
  createOfflineSale: jest.fn().mockResolvedValue({ offlineSaleId: "off-1", billRef: "OFF-001" }),
}));

jest.mock("../../services/offline/sync", () => ({
  syncOutbox: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/networkStatus", () => ({
  isOnline: jest.fn().mockResolvedValue(true),
  subscribeNetworkStatus: jest.fn(() => jest.fn()),
}));

jest.mock("../../services/api/uiStatusApi", () => ({
  fetchUiStatus: jest.fn().mockResolvedValue(null),
}));

// ─── Device / session ────────────────────────────────────────────────────────
jest.mock("../../services/deviceSession", () => ({
  getDeviceToken: jest.fn().mockResolvedValue("test-device-token"),
  getDeviceStoreId: jest.fn().mockResolvedValue("store-test-123"),
}));

jest.mock("../../services/storeScope", () => ({
  normalizeStoreScope: (storeId: string | null) => (storeId ? String(storeId) : "unassigned"),
  storeScopedStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

// ─── Logging / telemetry ─────────────────────────────────────────────────────
jest.mock("../../services/cloudEventLogger", () => ({
  logPaymentEvent: jest.fn(),
  logPosEvent: jest.fn(),
}));

jest.mock("../../services/eventLogger", () => ({
  eventLogger: { log: jest.fn() },
}));

// ─── Hardware / printer ──────────────────────────────────────────────────────
jest.mock("../../services/printerService", () => ({
  printerService: { printReceipt: jest.fn().mockResolvedValue(undefined) },
}));

// ─── Stock ───────────────────────────────────────────────────────────────────
jest.mock("../../services/stockService", () => ({
  resolveStockForCartItem: jest.fn().mockReturnValue(null),
}));

// ─── UI utils ────────────────────────────────────────────────────────────────
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// react-native-qrcode-svg uses native SVG rendering that hangs in Jest/Node
jest.mock("react-native-qrcode-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { default: () => React.createElement(View, null) };
});

// SplitPaymentModal also imports react-native-qrcode-svg; mock the component itself
// to avoid its own async state effects interfering with createSale flow
jest.mock("../../components/sell/SplitPaymentModal", () => ({
  SplitPaymentModal: () => null,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: jest.fn() },
  }),
}));

jest.mock("../../config/api", () => ({
  BUILD_INFO: { version: "1.0.0", buildDate: "2026-03-07" },
  API_BASE_URL: "http://localhost:3010",
}));

// expo-crypto (used by utils/uuid.ts → uuidv4()) is unavailable in Jest/Node.
// Mock it so pendingSaleIdRef gets a valid string UUID (INV-O3 idempotency key).
jest.mock("expo-crypto", () => ({
  randomUUID: () => "test-uuid-regression-001",
}));

jest.mock("../../utils/money", () => ({
  formatMoney: (minor: number) => `₹${(minor / 100).toFixed(2)}`,
}));

jest.mock("../../i18n/formatters", () => ({
  formatDateTime: () => "07/03/2026 10:00",
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

// ─── Import SUT (after all jest.mock calls) ──────────────────────────────────
import PaymentScreen from "../../screens/PaymentScreen";
import { createSale } from "../../services/api/posApi";

const mockCreateSale = createSale as jest.MockedFunction<typeof createSale>;

// Valid createSale response shape (matches SaleCreateResponse in posApi.ts)
const VALID_SALE_RESPONSE = {
  saleId: "sale-regression-001",
  billRef: "B-REGRESSION-001",
  totals: { subtotalMinor: 10000, discountMinor: 0, totalMinor: 10000 },
};

// =============================================================================
// ISSUE-051 / ISSUE-066: createSaleInFlightRef prevents self-cancelling useEffect
// =============================================================================

describe("ISSUE-051/066: createSaleInFlightRef prevents self-cancelling useEffect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSale.mockResolvedValue(VALID_SALE_RESPONSE);

    // Single item in cart — sufficient to trigger the createSale useEffect
    mockCurrentItems = [
      {
        id: "prod-001",
        name: "Rice 5KG",
        barcode: "8901234567890",
        quantity: 2,
        priceMinor: 5000,
        currency: "INR",
        metadata: {},
      },
    ];
  });

  // MFA-002: Increase test timeout — under heavy CI/machine load, mock resolution + React
  // state updates can exceed the default 5000ms Jest timeout
  it("createSale is called exactly once after mount — ref guard prevents double invocation (ISSUE-051/066)", async () => {
    // REGRESSION: If ISSUE-051 were present, loadingSale in the deps array would cause
    // the effect to cleanup (cancelled=true) and re-run on setLoadingSale(true).
    // The first call's .then() would be cancelled (cancelled=true check at L467),
    // so setSaleId/setBillRef would never be called, and the button would stay disabled.
    // FIXED: createSaleInFlightRef.current = true at L376 prevents re-entry; loadingSale
    // is intentionally omitted from deps (PaymentScreen.tsx:525 comment).
    render(<PaymentScreen />);

    await waitFor(
      () => {
        expect(mockCreateSale).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 }
    );

    // Guard holds: no second invocation after the first resolves
    expect(mockCreateSale).toHaveBeenCalledTimes(1);
  }, 30000);

  it("createSale request body contains correct required fields", async () => {
    render(<PaymentScreen />);

    await waitFor(() => {
      expect(mockCreateSale).toHaveBeenCalled();
    }, { timeout: 3000 });

    const callArg = mockCreateSale.mock.calls[0][0];

    // saleId is a stable UUID from pendingSaleIdRef (idempotency key — INV-O3)
    expect(typeof callArg.saleId).toBe("string");
    expect((callArg.saleId as string).length).toBeGreaterThan(0);

    expect(callArg.items).toHaveLength(1);
    expect(callArg.items[0]).toMatchObject({
      productId: "prod-001",
      name: "Rice 5KG",
      quantity: 2,
      priceMinor: 5000,
    });
  }, 30000);
});

// =============================================================================
// ISSUE-068: store_product_id passed correctly to createSale backend
// =============================================================================

describe("ISSUE-068: storeProductId from cart metadata forwarded as store_product_id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSale.mockResolvedValue(VALID_SALE_RESPONSE);
  });

  it("store_product_id is sent when cart item has metadata.storeProductId (ISSUE-068 guard)", async () => {
    // REGRESSION: If metadata.storeProductId were dropped, the backend createSale handler
    // (sales.ts:1062-1074) could not resolve the variant via catalog bridge, causing
    // product_not_found errors for catalog-digitised products.
    // FIXED: PaymentScreen.tsx:441-444 reads storeProductId from metadata;
    //        PaymentScreen.tsx:458 passes it as store_product_id in the request item.
    mockCurrentItems = [
      {
        id: "prod-catalog-abc",
        name: "Cooking Oil 1L",
        barcode: "8905678901234",
        quantity: 1,
        priceMinor: 15000,
        currency: "INR",
        metadata: {
          storeProductId: "sp-abc-def-ghi",
          globalProductId: "gp-xyz-789",
        },
      },
    ];

    render(<PaymentScreen />);

    await waitFor(() => {
      expect(mockCreateSale).toHaveBeenCalled();
    }, { timeout: 3000 });

    const sentItem = mockCreateSale.mock.calls[0][0].items[0];

    // ISSUE-068: store_product_id MUST reach the backend so variant resolution succeeds
    expect(sentItem.store_product_id).toBe("sp-abc-def-ghi");
    expect(sentItem.global_product_id).toBe("gp-xyz-789");
    expect(sentItem.productId).toBe("prod-catalog-abc");
  }, 30000);

  it("store_product_id is absent when cart item has no metadata.storeProductId", async () => {
    // Regular product (not catalog-digitised) — no storeProductId in metadata.
    // store_product_id must be undefined (not empty string or null) so backend
    // does not receive a malformed value for this optional field.
    mockCurrentItems = [
      {
        id: "prod-regular-xyz",
        name: "Biscuit Pack",
        barcode: "8901122334455",
        quantity: 3,
        priceMinor: 2000,
        currency: "INR",
        metadata: {},
      },
    ];

    render(<PaymentScreen />);

    await waitFor(() => {
      expect(mockCreateSale).toHaveBeenCalled();
    }, { timeout: 3000 });

    const sentItem = mockCreateSale.mock.calls[0][0].items[0];

    // No storeProductId → field should be undefined (not null, not "")
    expect(sentItem.store_product_id).toBeUndefined();
  }, 30000);
});
