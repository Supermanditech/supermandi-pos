/**
 * GCP-STG-0410: SELL Detail — Expiry Date + Cost Price info section
 *
 * Verifies that ProductDetailSheetV3 in SELL context:
 * 1. Renders expiry date with color coding (red <30d, yellow <90d, green otherwise)
 * 2. Shows "(EXPIRED)" suffix for past-due items
 * 3. Renders cost/purchase price formatted in rupees
 * 4. Only renders in SELL context (not BUY)
 * 5. expiryDate flows through ProductTileData from Product store
 */
import React from "react";
import { render } from "@testing-library/react-native";
import ProductDetailSheetV3 from "../../components/v3/ProductDetailSheetV3";
import type { ProductTileData } from "../../components/v3/ProductTileV3";

// Mock theme
jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    surface: "#fff",
    primary: "#2563eb",
    textPrimary: "#1a1a1a",
    textSecondary: "#555",
    textTertiary: "#999",
    backgroundSecondary: "#f5f5f5",
    border: "#e0e0e0",
    success: "#16a34a",
    warning: "#f59e0b",
    error: "#dc2626",
  }),
}));

jest.mock("../../theme/responsive", () => ({
  getScreenPadding: () => 16,
}));

jest.mock("../../utils/showToast", () => ({
  showToast: jest.fn(),
}));

const baseProduct: ProductTileData = {
  id: "prod-001",
  name: "Parle-G Biscuits",
  priceMrpMinor: 2000,
  barcode: "8901234567890",
  stock: 50,
};

const noop = () => {};

describe("GCP-STG-0410: SELL Detail Info Section", () => {
  describe("Expiry date display", () => {
    it("renders expiry date when product has expiryDate in SELL context", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 120);
      const product: ProductTileData = {
        ...baseProduct,
        expiryDate: futureDate.toISOString(),
      };

      const { getByTestId } = render(
        <ProductDetailSheetV3
          product={product}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      const expiryEl = getByTestId("sell-expiry-date");
      expect(expiryEl).toBeTruthy();
      // Should NOT show day count suffix for >90 days
      expect(expiryEl.props.children.join("")).not.toContain("d)");
    });

    it("shows red color and day count for expiry <30 days", () => {
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 15);
      const product: ProductTileData = {
        ...baseProduct,
        expiryDate: nearDate.toISOString(),
      };

      const { getByTestId } = render(
        <ProductDetailSheetV3
          product={product}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      const expiryEl = getByTestId("sell-expiry-date");
      // Color should be error (red)
      const flatStyle = Array.isArray(expiryEl.props.style)
        ? Object.assign({}, ...expiryEl.props.style)
        : expiryEl.props.style;
      expect(flatStyle.color).toBe("#dc2626");
      // Should show day count
      expect(expiryEl.props.children.join("")).toContain("d)");
    });

    it("shows yellow color for expiry 30-90 days", () => {
      const medDate = new Date();
      medDate.setDate(medDate.getDate() + 60);
      const product: ProductTileData = {
        ...baseProduct,
        expiryDate: medDate.toISOString(),
      };

      const { getByTestId } = render(
        <ProductDetailSheetV3
          product={product}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      const expiryEl = getByTestId("sell-expiry-date");
      const flatStyle = Array.isArray(expiryEl.props.style)
        ? Object.assign({}, ...expiryEl.props.style)
        : expiryEl.props.style;
      expect(flatStyle.color).toBe("#f59e0b");
    });

    it("shows green color for expiry >90 days", () => {
      const farDate = new Date();
      farDate.setDate(farDate.getDate() + 200);
      const product: ProductTileData = {
        ...baseProduct,
        expiryDate: farDate.toISOString(),
      };

      const { getByTestId } = render(
        <ProductDetailSheetV3
          product={product}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      const expiryEl = getByTestId("sell-expiry-date");
      const flatStyle = Array.isArray(expiryEl.props.style)
        ? Object.assign({}, ...expiryEl.props.style)
        : expiryEl.props.style;
      expect(flatStyle.color).toBe("#16a34a");
    });

    it("shows EXPIRED suffix for past-due products", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const product: ProductTileData = {
        ...baseProduct,
        expiryDate: pastDate.toISOString(),
      };

      const { getByTestId } = render(
        <ProductDetailSheetV3
          product={product}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      const expiryEl = getByTestId("sell-expiry-date");
      expect(expiryEl.props.children.join("")).toContain("EXPIRED");
    });

    it("does not render expiry when product has no expiryDate", () => {
      const { queryByTestId } = render(
        <ProductDetailSheetV3
          product={baseProduct}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      expect(queryByTestId("sell-expiry-date")).toBeNull();
    });
  });

  describe("Cost price display", () => {
    it("renders cost price when purchasePriceMinor is set", () => {
      const product: ProductTileData = {
        ...baseProduct,
        purchasePriceMinor: 1500,
      };

      const { getByTestId } = render(
        <ProductDetailSheetV3
          product={product}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      const costEl = getByTestId("sell-cost-price");
      expect(costEl).toBeTruthy();
      // 1500 paise = Rs 15.00
      expect(costEl.props.children.join("")).toContain("15");
    });

    it("does not render cost price when purchasePriceMinor is 0", () => {
      const product: ProductTileData = {
        ...baseProduct,
        purchasePriceMinor: 0,
      };

      const { queryByTestId } = render(
        <ProductDetailSheetV3
          product={product}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      expect(queryByTestId("sell-cost-price")).toBeNull();
    });

    it("does not render cost price when purchasePriceMinor is undefined", () => {
      const { queryByTestId } = render(
        <ProductDetailSheetV3
          product={baseProduct}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      expect(queryByTestId("sell-cost-price")).toBeNull();
    });
  });

  describe("Context isolation", () => {
    it("renders sell-info-section in SELL context", () => {
      const product: ProductTileData = {
        ...baseProduct,
        expiryDate: new Date(Date.now() + 86400000 * 60).toISOString(),
        purchasePriceMinor: 1500,
      };

      const { getByTestId } = render(
        <ProductDetailSheetV3
          product={product}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="SELL"
        />
      );

      expect(getByTestId("sell-info-section")).toBeTruthy();
    });

    it("does NOT render sell-info-section in BUY context", () => {
      const product: ProductTileData = {
        ...baseProduct,
        expiryDate: new Date(Date.now() + 86400000 * 60).toISOString(),
        purchasePriceMinor: 1500,
      };

      const { queryByTestId } = render(
        <ProductDetailSheetV3
          product={product}
          visible={true}
          onClose={noop}
          onAddToCart={noop}
          context="BUY"
        />
      );

      expect(queryByTestId("sell-info-section")).toBeNull();
    });
  });

  describe("ProductTileData expiryDate field", () => {
    it("expiryDate is an optional field on ProductTileData", () => {
      // Type-level test: ProductTileData accepts expiryDate
      const withExpiry: ProductTileData = {
        ...baseProduct,
        expiryDate: "2026-12-31",
      };
      expect(withExpiry.expiryDate).toBe("2026-12-31");

      // ProductTileData works without expiryDate
      const withoutExpiry: ProductTileData = { ...baseProduct };
      expect(withoutExpiry.expiryDate).toBeUndefined();
    });
  });
});
