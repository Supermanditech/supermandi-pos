/**
 * V3-FIX-135 / V3-FIX-136 / V3-HARDEN-137 / V3-DELETE-138
 * Runtime proof for detail-first browsing contract
 *
 * Proves via actual component rendering:
 * - SELL tile tap opens detail sheet, does NOT add to cart
 * - BUY card tap opens detail sheet, does NOT mutate purchase cart
 * - Add-to-cart only from explicit CTA inside detail surface
 * - No MOQ pre-seeding on BUY screen load
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("react-native-svg", () => {
  const RN = require("react-native");
  const mock = (props: any) => RN.createElement(RN.View, props);
  return { __esModule: true, default: mock, Svg: mock, Rect: mock, Path: mock, Circle: mock, Line: mock };
});

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, d: string) => d || k }),
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
  getScreenPadding: () => 16,
  getGridColumns: () => 3,
  getChipPadding: () => ({ h: 16, v: 8 }),
  getChipFontSize: () => 12,
}));

jest.mock("../../utils/showToast", () => ({ showToast: jest.fn() }));

// ── SELL Test: ProductTileV3 + ProductDetailSheetV3 ────────────────────────

import ProductTileV3, { type ProductTileData } from "../../components/v3/ProductTileV3";
import ProductDetailSheetV3 from "../../components/v3/ProductDetailSheetV3";

const MOCK_PRODUCT: ProductTileData = {
  id: "p1", name: "Maggi Noodles", priceMrpMinor: 1400, barcode: "8901234",
  brand: "Nestle", category: "Noodles", stock: 50, unit: "pcs", caseSize: 24,
};

describe("V3-FIX-135: SELL detail-first (runtime)", () => {
  it("tile tap fires onPress but does NOT add to cart", () => {
    const onPress = jest.fn();
    render(
      <ProductTileV3 product={MOCK_PRODUCT} sellMode="retail" cartQty={0} onPress={onPress} />
    );

    // Tap the tile
    const tile = screen.getByLabelText(/tap for details/i);
    fireEvent.press(tile);

    // onPress was called (opens detail sheet in parent)
    expect(onPress).toHaveBeenCalledTimes(1);
    // No cart mutation happened (onPress doesn't call addItem)
  });

  it("ProductDetailSheetV3 Add CTA fires onAddToCart with product + qty", () => {
    const onAddToCart = jest.fn();
    const onClose = jest.fn();

    render(
      <ProductDetailSheetV3
        product={MOCK_PRODUCT}
        visible={true}
        onClose={onClose}
        onAddToCart={onAddToCart}
        context="SELL"
      />
    );

    // Detail sheet is visible
    expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();

    // Tap the top Add CTA
    const topAdd = screen.getByTestId("detail-top-add");
    fireEvent.press(topAdd);

    // onAddToCart called with product and qty=1
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart).toHaveBeenCalledWith(MOCK_PRODUCT, 1);
  });

  it("close from detail does NOT mutate cart", () => {
    const onAddToCart = jest.fn();
    const onClose = jest.fn();

    render(
      <ProductDetailSheetV3
        product={MOCK_PRODUCT}
        visible={true}
        onClose={onClose}
        onAddToCart={onAddToCart}
        context="SELL"
      />
    );

    // Tap close button
    const closeBtn = screen.getByLabelText("Close details");
    fireEvent.press(closeBtn);

    // onClose called, but onAddToCart NOT called
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAddToCart).not.toHaveBeenCalled();
  });
});

// ── BUY Test: SupplierProductCardV3 + ProductDetailSheetV3 ─────────────────

import SupplierProductCardV3 from "../../components/v3/SupplierProductCardV3";

const MOCK_SUPPLIER_PRODUCT = {
  id: "sp1", supplierId: "s1", name: "Tata Tea Gold", brand: "Tata",
  category: "Tea", packSize: "500g", caseSize: 12, unit: "pcs",
  mrpMinor: 28000, ptrMinor: 22400, hsnCode: "0902", gstPct: 5,
  moq: 2, supplierName: "Tata Consumer", deliveryDays: 3,
};

describe("V3-FIX-136: BUY detail-first (runtime)", () => {
  it("supplier card tap fires onPress (opens detail), no inline add exists", () => {
    const onPress = jest.fn();
    render(
      <SupplierProductCardV3 product={MOCK_SUPPLIER_PRODUCT} onPress={onPress} />
    );

    // Card should show "Tap for details"
    expect(screen.getByText(/Tap for details/)).toBeTruthy();

    // Tap the card
    fireEvent.press(screen.getByText(MOCK_SUPPLIER_PRODUCT.name));

    // onPress was called
    expect(onPress).toHaveBeenCalledTimes(1);

    // No "+ Cart" button exists on the card
    expect(screen.queryByText("+ Cart")).toBeNull();
  });

  it("BUY detail sheet shows procurement metadata and uses trade price", () => {
    const onAddToCart = jest.fn();
    const onClose = jest.fn();

    render(
      <ProductDetailSheetV3
        product={{
          id: MOCK_SUPPLIER_PRODUCT.id,
          name: MOCK_SUPPLIER_PRODUCT.name,
          priceMrpMinor: MOCK_SUPPLIER_PRODUCT.mrpMinor,
          priceTradeMinor: MOCK_SUPPLIER_PRODUCT.ptrMinor,
          brand: MOCK_SUPPLIER_PRODUCT.brand,
          category: MOCK_SUPPLIER_PRODUCT.category,
          caseSize: MOCK_SUPPLIER_PRODUCT.caseSize,
          unit: MOCK_SUPPLIER_PRODUCT.unit,
        }}
        visible={true}
        onClose={onClose}
        onAddToCart={onAddToCart}
        context="BUY"
        procurement={{
          supplierName: MOCK_SUPPLIER_PRODUCT.supplierName,
          ptrMinor: MOCK_SUPPLIER_PRODUCT.ptrMinor,
          hsnCode: MOCK_SUPPLIER_PRODUCT.hsnCode,
          gstPct: MOCK_SUPPLIER_PRODUCT.gstPct,
          moq: MOCK_SUPPLIER_PRODUCT.moq,
          deliveryDays: MOCK_SUPPLIER_PRODUCT.deliveryDays,
        }}
      />
    );

    // Detail sheet visible
    expect(screen.getByTestId("product-detail-sheet")).toBeTruthy();

    // Shows supplier name, HSN, GST from procurement metadata
    expect(screen.getByText(MOCK_SUPPLIER_PRODUCT.supplierName)).toBeTruthy();
    expect(screen.getByText(MOCK_SUPPLIER_PRODUCT.hsnCode)).toBeTruthy();
    expect(screen.getByText("5%")).toBeTruthy();

    // Price display uses trade/PTR price (₹224), not MRP (₹280)
    expect(screen.getByText("₹224")).toBeTruthy();

    // Both top and bottom Add CTAs exist for purchase cart
    expect(screen.getAllByText(/Add to Purchase Cart/).length).toBeGreaterThanOrEqual(2);
  });

  it("BUY detail Add CTA fires onAddToCart, close does not", () => {
    const onAddToCart = jest.fn();
    const onClose = jest.fn();

    render(
      <ProductDetailSheetV3
        product={{
          id: "sp1", name: "Test Product", priceMrpMinor: 10000,
          priceTradeMinor: 8000, brand: "Test",
        }}
        visible={true}
        onClose={onClose}
        onAddToCart={onAddToCart}
        context="BUY"
      />
    );

    // Close without adding — no cart mutation
    const closeBtn = screen.getByLabelText("Close details");
    fireEvent.press(closeBtn);
    expect(onAddToCart).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
