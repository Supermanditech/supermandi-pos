/**
 * SCALE-B1: SellTile component tests
 * Covers: all required display states per approved design.
 * Staff view: purchase_price, margin, supplier_name must NOT appear.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { SellTile, type SellTileProduct } from "../../components/sell/SellTile";

// Mock useThemeColors with realistic values
jest.mock("../../theme", () => ({
  useThemeColors: () => ({
    surface: "#FFFFFF",
    border: "#E2E8F0",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textTertiary: "#64748B",
    backgroundTertiary: "#E2E8F0",
    primary: "#2563EB",
    primarySoft: "#EFF6FF",
    accent: "#14B8A6",
    accentLight: "#F0FDFA",
    secondary: "#14B8A6",
    success: "#16A34A",
    warning: "#F59E0B",
    error: "#DC2626",
  }),
}));

// Mock ProductImage to keep tests simple (avoid Image native module)
jest.mock("../../components/ProductImage", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    ProductImage: ({ uri, testID }: { uri?: string | null; testID?: string }) =>
      uri ? (
        <View testID={testID ?? "product-image"}>
          <Text>{uri}</Text>
        </View>
      ) : (
        <View testID={testID ?? "product-image-placeholder"} />
      ),
  };
});

// =============================================================================
// FIXTURES
// =============================================================================

const baseProduct: SellTileProduct = {
  barcode: "8901234567890",
  name: "Tata Salt Iodized",
  sellPriceMinor: 2800, // ₹28.00
  mrp: 3000,            // ₹30.00
  gst_rate: 18,
  net_content_value: 1,
  net_content_unit: "kg",
  image_url: "https://storage.googleapis.com/test/tata-salt.jpg",
  expiry_date: null,
  brand: "Tata",
  mode: "PACKAGED",
  rate_unit: null,
  currentStock: 145,
};

// =============================================================================
// TESTS
// =============================================================================

describe("SellTile", () => {
  it("renders with all required fields", () => {
    render(<SellTile product={baseProduct} />);

    expect(screen.getByTestId("sell-tile")).toBeTruthy();
    expect(screen.getByTestId("sell-tile-name")).toBeTruthy();
    expect(screen.getByTestId("sell-tile-sell-price")).toBeTruthy();
    expect(screen.getByTestId("sell-tile-stock")).toBeTruthy();
    expect(screen.getByTestId("sell-tile-gst")).toBeTruthy();
    expect(screen.getByTestId("sell-tile-barcode")).toBeTruthy();
  });

  it("shows image when image_url is provided", () => {
    render(<SellTile product={baseProduct} />);
    // ProductImage mock renders with testID="product-image" when uri is set
    expect(screen.getByTestId("sell-tile-image")).toBeTruthy();
  });

  it("shows image fallback when image_url is null", () => {
    render(<SellTile product={{ ...baseProduct, image_url: null }} />);
    expect(screen.getByTestId("sell-tile-image-fallback")).toBeTruthy();
  });

  it("displays MRP strikethrough when mrp > sellPrice (STG-228)", () => {
    render(<SellTile product={{ ...baseProduct, mrp: 3000, sellPriceMinor: 2800 }} />);
    // STG-228: When mrp > sellPrice, shows strikethrough MRP instead of plain MRP
    const mrpStrikethrough = screen.getByTestId("sell-tile-mrp-strikethrough");
    expect(mrpStrikethrough).toBeTruthy();
    expect(mrpStrikethrough.props.children).toContain("₹30");
    // Plain MRP should NOT be shown when strikethrough is active
    expect(screen.queryByTestId("sell-tile-mrp")).toBeNull();
  });

  it("displays plain MRP when mrp > 0 but mrp <= sellPrice", () => {
    // When sell price equals or exceeds MRP, show plain MRP label (no discount)
    render(<SellTile product={{ ...baseProduct, mrp: 2500, sellPriceMinor: 2800 }} />);
    const mrp = screen.getByTestId("sell-tile-mrp");
    expect(mrp).toBeTruthy();
    expect(mrp.props.children).toContain("₹25");
  });

  it("does NOT display MRP element when mrp is null", () => {
    render(<SellTile product={{ ...baseProduct, mrp: null }} />);
    expect(screen.queryByTestId("sell-tile-mrp")).toBeNull();
  });

  it("does NOT display MRP element when mrp is 0", () => {
    render(<SellTile product={{ ...baseProduct, mrp: 0 }} />);
    expect(screen.queryByTestId("sell-tile-mrp")).toBeNull();
  });

  it("stock text is green color when stock > 10", () => {
    render(<SellTile product={{ ...baseProduct, currentStock: 145 }} />);
    const stock = screen.getByTestId("sell-tile-stock");
    // Style is applied as [styles.stock, { color: stockColor }]
    const flatStyle = Array.isArray(stock.props.style)
      ? Object.assign({}, ...stock.props.style)
      : stock.props.style;
    expect(flatStyle.color).toBe("#16A34A"); // colors.success
  });

  it("stock text is orange color when stock is 1–10", () => {
    render(<SellTile product={{ ...baseProduct, currentStock: 5 }} />);
    const stock = screen.getByTestId("sell-tile-stock");
    const flatStyle = Array.isArray(stock.props.style)
      ? Object.assign({}, ...stock.props.style)
      : stock.props.style;
    expect(flatStyle.color).toBe("#F59E0B"); // colors.warning
  });

  it("stock text is red color when stock is 0", () => {
    render(<SellTile product={{ ...baseProduct, currentStock: 0 }} />);
    const stock = screen.getByTestId("sell-tile-stock");
    const flatStyle = Array.isArray(stock.props.style)
      ? Object.assign({}, ...stock.props.style)
      : stock.props.style;
    expect(flatStyle.color).toBe("#DC2626"); // colors.error
  });

  it("shows orange expiry warning when 31–90 days remain", () => {
    // Set expiry 60 days from now
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 60);
    const expiryIso = futureDate.toISOString();

    render(<SellTile product={{ ...baseProduct, expiry_date: expiryIso }} />);
    const expiry = screen.getByTestId("sell-tile-expiry");
    expect(expiry).toBeTruthy();
    expect(expiry.props.children).toMatch(/⚠ Exp:/);

    const flatStyle = Array.isArray(expiry.props.style)
      ? Object.assign({}, ...expiry.props.style)
      : expiry.props.style;
    expect(flatStyle.color).toBe("#F59E0B"); // orange = warning
  });

  it("shows red expiry warning when < 30 days remain", () => {
    // Set expiry 10 days from now
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 10);
    const expiryIso = soonDate.toISOString();

    render(<SellTile product={{ ...baseProduct, expiry_date: expiryIso }} />);
    const expiry = screen.getByTestId("sell-tile-expiry");
    expect(expiry).toBeTruthy();
    expect(expiry.props.children).toMatch(/⚠ Exp:/);

    const flatStyle = Array.isArray(expiry.props.style)
      ? Object.assign({}, ...expiry.props.style)
      : expiry.props.style;
    expect(flatStyle.color).toBe("#DC2626"); // red = error
  });

  it("shows red EXPIRED label when expiry date is in the past", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const expiryIso = pastDate.toISOString();

    render(<SellTile product={{ ...baseProduct, expiry_date: expiryIso }} />);
    const expiry = screen.getByTestId("sell-tile-expiry");
    expect(expiry.props.children).toBe("⚠ EXPIRED");

    const flatStyle = Array.isArray(expiry.props.style)
      ? Object.assign({}, ...expiry.props.style)
      : expiry.props.style;
    expect(flatStyle.color).toBe("#DC2626");
  });

  it("does NOT show expiry warning when > 90 days remain", () => {
    // Set expiry 120 days from now
    const farDate = new Date();
    farDate.setDate(farDate.getDate() + 120);
    const expiryIso = farDate.toISOString();

    render(<SellTile product={{ ...baseProduct, expiry_date: expiryIso }} />);
    expect(screen.queryByTestId("sell-tile-expiry")).toBeNull();
  });

  it("shows PACKAGED mode badge", () => {
    render(<SellTile product={{ ...baseProduct, mode: "PACKAGED" }} />);
    const badge = screen.getByTestId("sell-tile-mode-badge");
    expect(badge).toBeTruthy();
    // Badge text should say "PACKAGED"
    expect(screen.getByText("PACKAGED")).toBeTruthy();
  });

  it("shows LOOSE mode badge and per-unit price format", () => {
    render(
      <SellTile
        product={{
          ...baseProduct,
          mode: "LOOSE",
          rate_unit: "KG",
          net_content_value: null,
          net_content_unit: null,
          sellPriceMinor: 4500,
        }}
      />
    );
    expect(screen.getByText("LOOSE")).toBeTruthy();
    // Pack size for LOOSE should say "per KG"
    const packSize = screen.getByTestId("sell-tile-pack-size");
    expect(packSize.props.children).toBe("per KG");
    // Sell price should include the rate unit
    const priceEl = screen.getByTestId("sell-tile-sell-price");
    expect(priceEl.props.children).toBe("₹45.00/KG");
  });

  it("does NOT render purchase_price", () => {
    // No testID for purchase_price should exist, and no text matching "purchase" or "cost"
    render(<SellTile product={baseProduct} />);
    expect(screen.queryByTestId("sell-tile-purchase-price")).toBeNull();
    expect(screen.queryByTestId("sell-tile-margin")).toBeNull();
  });

  it("does NOT render supplier_name", () => {
    render(<SellTile product={baseProduct} />);
    expect(screen.queryByTestId("sell-tile-supplier")).toBeNull();
  });

  it("renders sell price as formatted rupees", () => {
    render(<SellTile product={{ ...baseProduct, sellPriceMinor: 2800 }} />);
    const price = screen.getByTestId("sell-tile-sell-price");
    expect(price.props.children).toBe("₹28.00");
  });

  it("renders GST percentage", () => {
    render(<SellTile product={{ ...baseProduct, gst_rate: 18 }} />);
    const gst = screen.getByTestId("sell-tile-gst");
    expect(gst.props.children).toEqual(["GST ", 18, "%"]);
  });

  it("renders barcode text", () => {
    render(<SellTile product={baseProduct} />);
    const barcode = screen.getByTestId("sell-tile-barcode");
    expect(barcode.props.children).toBe("8901234567890");
  });

  it("renders pack size for PACKAGED mode", () => {
    render(<SellTile product={{ ...baseProduct, mode: "PACKAGED", net_content_value: 500, net_content_unit: "g" }} />);
    const packSize = screen.getByTestId("sell-tile-pack-size");
    expect(packSize.props.children).toBe("500 g");
  });
});
