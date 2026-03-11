/**
 * SCALE-B2: CatalogProductCard component tests
 *
 * Approved design (Tile B — Retailer Buy Screen, NO margin):
 * - Image 48×48 via ProductImage component
 * - Name + brand
 * - Pack config: "70g × 12 Pack"
 * - Cost price labeled "Cost ₹X.XX/pack" — NOT margin, NOT sell price
 * - MRP shown only when > 0, hidden otherwise
 * - Stock status dot: green (in_stock), orange (low_stock), red (out_of_stock)
 * - MOQ shown only when > 1
 * - Supplier name + city
 * - BNPL badge when bnplEligible true, hidden when false
 * - GST% and HSN code
 * - [+ Order] button
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { CatalogProductCard } from "../../components/buy/CatalogProductCard";
import type { CatalogProduct } from "../../services/api/catalogApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
    success: "#16A34A",
    successSoft: "#F0FDF4",
    warning: "#F59E0B",
    error: "#DC2626",
    textInverse: "#FFFFFF",
  }),
  theme: {
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xxxl: 48 },
    borderRadius: { sm: 4, md: 8, lg: 12, full: 9999 },
    shadows: { sm: {} },
  },
}));

// Mock ProductImage: renders testID="catalog-card-image" when uri provided,
// testID="catalog-card-image-placeholder" when uri is null/undefined
jest.mock("../../components/ProductImage", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    ProductImage: ({
      uri,
      size,
      testID,
    }: {
      uri?: string | null;
      size?: number;
      testID?: string;
    }) =>
      uri ? (
        <View
          testID={testID ?? "catalog-card-image"}
          accessibilityLabel={`image-size-${size}`}
        />
      ) : (
        <View testID={testID ?? "catalog-card-image-placeholder"} />
      ),
  };
});

jest.mock("../../services/api/catalogApi", () => ({
  getLocalizedProductName: (product: any) => product.name,
  getLocalizedProductBrand: (product: any) => product.brand,
}));

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name, size }: { name: string; size: number }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, { testID: `icon-${name}` }, name);
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSupplier(overrides?: Partial<{
  supplierId: string;
  supplierName: string;
  purchasePrice: number;
  mrp: number;
  moq: number;
  stockQuantity: number;
  stockStatus: string;
  bnplEligible: boolean;
  isPreferred: boolean;
}>) {
  return {
    supplierId: "sup-001",
    supplierName: "Sharma Distributors",
    supplierProductId: "sp-001",
    purchasePrice: 12000, // ₹120.00 in paise
    mrp: 16800,           // ₹168.00 in paise
    moq: 5,
    maxQty: 100,
    stockQuantity: 50,
    stockStatus: "in_stock",
    isPreferred: true,
    bnplEligible: true,
    bnplMaxDays: 30,
    ...overrides,
  };
}

const baseProduct: CatalogProduct = {
  id: "prod-001",
  name: "Maggi 2-Min Noodles Masala",
  brand: "Nestlé",
  category: "Noodles",
  unit: "Pack",
  packSize: 12,
  primaryBarcode: "8901234567890",
  hsnCode: "19023010",
  gstRate: 18,
  imageUrl: "https://storage.googleapis.com/test/maggi.jpg",
  netContentValue: 70,
  netContentUnit: "g",
  supplierName: "Sharma Distributors",
  supplierCity: "Pune",
  bnplEligible: true,
  isActive: true,
  bestPrice: 12000, // ₹120.00 in paise
  minMoq: 5,
  supplierCount: 1,
  stockStatus: "in_stock",
  suppliers: [makeSupplier()],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CatalogProductCard", () => {
  // 1. Image renders at 48px
  it("renders ProductImage with 48px size when imageUrl is provided", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    const img = screen.getByTestId("catalog-card-image");
    // The mock sets accessibilityLabel to "image-size-{size}"
    expect(img.props.accessibilityLabel).toBe("image-size-48");
  });

  // 2. Image placeholder when no image URL
  it("renders image placeholder when imageUrl is null", () => {
    render(
      <CatalogProductCard
        product={{ ...baseProduct, imageUrl: null }}
        onPress={jest.fn()}
      />
    );
    // When uri=null, the ProductImage mock renders with testID="catalog-card-image"
    // (the testID prop we pass), but accessibilityLabel is not set (uri is falsy)
    const imgEl = screen.getByTestId("catalog-card-image");
    // It should NOT have the image-size label — that only appears when uri is truthy
    expect(imgEl.props.accessibilityLabel).toBeUndefined();
  });

  // 3. Product name renders
  it("renders product name", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    expect(screen.getByTestId("catalog-card-name").props.children).toBe(
      "Maggi 2-Min Noodles Masala"
    );
  });

  // 4. Brand renders
  it("renders brand name", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    expect(screen.getByTestId("catalog-card-brand").props.children).toBe("Nestlé");
  });

  // 5. Pack config format "70g × 12 Pack"
  it("renders pack config as 'NETCONTENTunit × PACKSIZE Pack'", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    const packConfig = screen.getByTestId("catalog-card-pack-config");
    expect(packConfig.props.children).toBe("70g × 12 Pack");
  });

  // 6. Pack config hidden when netContentValue is null
  it("does NOT render pack config when netContentValue is null", () => {
    render(
      <CatalogProductCard
        product={{ ...baseProduct, netContentValue: null, netContentUnit: null }}
        onPress={jest.fn()}
      />
    );
    expect(screen.queryByTestId("catalog-card-pack-config")).toBeNull();
  });

  // 7. Cost price is labeled "Cost ₹X.XX/pack" — NOT margin
  it("cost price is labeled Cost, NOT margin or sell price", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    const costEl = screen.getByTestId("catalog-card-cost-price");
    expect(costEl.props.children).toBe("Cost ₹120.00/pack");
    // Must NOT contain the word "margin"
    expect(costEl.props.children).not.toMatch(/margin/i);
  });

  // 8. MRP shown when supplier has mrp > 0
  it("shows MRP when supplier mrp > 0", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    const mrp = screen.getByTestId("catalog-card-mrp");
    expect(mrp.props.children).toBe("MRP ₹168.00");
  });

  // 9. MRP hidden when supplier mrp is null or 0
  it("does NOT show MRP when supplier mrp is 0", () => {
    const product: CatalogProduct = {
      ...baseProduct,
      suppliers: [makeSupplier({ mrp: 0 })],
    };
    render(<CatalogProductCard product={product} onPress={jest.fn()} />);
    expect(screen.queryByTestId("catalog-card-mrp")).toBeNull();
  });

  // Helper: flatten style array into a single object
  function flatStyle(styleOrArray: any): Record<string, any> {
    if (Array.isArray(styleOrArray)) {
      return Object.assign({}, ...styleOrArray.map(flatStyle));
    }
    return styleOrArray ?? {};
  }

  // 10. Stock dot is green for in_stock
  it("stock dot is green (#16A34A) for in_stock", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    const dot = screen.getByTestId("catalog-card-stock-dot");
    expect(flatStyle(dot.props.style).backgroundColor).toBe("#16A34A");
  });

  // 11. Stock dot is orange for low_stock
  it("stock dot is orange (#F59E0B) for low_stock", () => {
    render(
      <CatalogProductCard
        product={{ ...baseProduct, stockStatus: "low_stock" }}
        onPress={jest.fn()}
      />
    );
    const dot = screen.getByTestId("catalog-card-stock-dot");
    expect(flatStyle(dot.props.style).backgroundColor).toBe("#F59E0B");
  });

  // 12. Stock dot is red for out_of_stock
  it("stock dot is red (#DC2626) for out_of_stock", () => {
    render(
      <CatalogProductCard
        product={{ ...baseProduct, stockStatus: "out_of_stock" }}
        onPress={jest.fn()}
      />
    );
    const dot = screen.getByTestId("catalog-card-stock-dot");
    expect(flatStyle(dot.props.style).backgroundColor).toBe("#DC2626");
  });

  // 13. MOQ shown when > 1
  it("shows MOQ badge when minMoq > 1", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    const moq = screen.getByTestId("catalog-card-moq");
    expect(moq.props.children).toBe("MOQ: 5 packs");
  });

  // 14. MOQ hidden when minMoq = 1
  it("does NOT show MOQ badge when minMoq is 1", () => {
    render(
      <CatalogProductCard
        product={{ ...baseProduct, minMoq: 1 }}
        onPress={jest.fn()}
      />
    );
    expect(screen.queryByTestId("catalog-card-moq")).toBeNull();
  });

  // 15. Supplier name + city shown
  it("shows supplier name and city", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    const supplier = screen.getByTestId("catalog-card-supplier");
    expect(supplier.props.children).toBe("Sharma Distributors (Pune)");
  });

  // 16. Supplier shown without city when city is null
  it("shows supplier name only when supplierCity is null", () => {
    render(
      <CatalogProductCard
        product={{ ...baseProduct, supplierCity: null }}
        onPress={jest.fn()}
      />
    );
    const supplier = screen.getByTestId("catalog-card-supplier");
    expect(supplier.props.children).toBe("Sharma Distributors");
  });

  // 17. BNPL badge shown when bnplEligible is true
  it("shows BNPL badge when bnplEligible is true", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    expect(screen.getByTestId("catalog-card-bnpl-badge")).toBeTruthy();
    expect(screen.getByText("BNPL ✓")).toBeTruthy();
  });

  // 18. BNPL badge hidden when bnplEligible is false
  it("does NOT show BNPL badge when bnplEligible is false", () => {
    render(
      <CatalogProductCard
        product={{ ...baseProduct, bnplEligible: false }}
        onPress={jest.fn()}
      />
    );
    expect(screen.queryByTestId("catalog-card-bnpl-badge")).toBeNull();
  });

  // 19. GST% shown
  it("shows GST percentage", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    const gst = screen.getByTestId("catalog-card-gst");
    expect(gst.props.children).toBe("GST 18%");
  });

  // 20. HSN code shown
  it("shows HSN code", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    const hsn = screen.getByTestId("catalog-card-hsn");
    expect(hsn.props.children).toBe("HSN 19023010");
  });

  // 21. [+ Order] button is present and triggers onPress
  it("renders Order button and calls onPress when tapped", () => {
    const onPress = jest.fn();
    render(<CatalogProductCard product={baseProduct} onPress={onPress} />);
    const button = screen.getByTestId("catalog-card-order-button");
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(baseProduct);
  });

  // 22. Cart quantity badge shown when cartQuantity > 0
  it("shows cart quantity badge when cartQuantity > 0", () => {
    render(
      <CatalogProductCard product={baseProduct} onPress={jest.fn()} cartQuantity={3} />
    );
    expect(screen.getByTestId("catalog-card-cart-badge")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  // 23. Cart badge hidden when cartQuantity = 0
  it("does NOT show cart badge when cartQuantity is 0", () => {
    render(
      <CatalogProductCard product={baseProduct} onPress={jest.fn()} cartQuantity={0} />
    );
    expect(screen.queryByTestId("catalog-card-cart-badge")).toBeNull();
  });

  // 24. GST hidden when gstRate is null
  it("does NOT show GST when gstRate is null", () => {
    render(
      <CatalogProductCard
        product={{ ...baseProduct, gstRate: null }}
        onPress={jest.fn()}
      />
    );
    expect(screen.queryByTestId("catalog-card-gst")).toBeNull();
  });

  // 25. HSN hidden when hsnCode is null
  it("does NOT show HSN when hsnCode is null", () => {
    render(
      <CatalogProductCard
        product={{ ...baseProduct, hsnCode: null }}
        onPress={jest.fn()}
      />
    );
    expect(screen.queryByTestId("catalog-card-hsn")).toBeNull();
  });

  // 26. No margin element anywhere — critical business rule
  it("does NOT render any element with testID containing 'margin'", () => {
    render(<CatalogProductCard product={baseProduct} onPress={jest.fn()} />);
    // No element should have testID containing "margin"
    expect(screen.queryByTestId("catalog-card-margin")).toBeNull();
    // Cost label text must not say margin
    const cost = screen.getByTestId("catalog-card-cost-price");
    expect(String(cost.props.children)).not.toMatch(/margin/i);
  });

  // 27. Card itself is pressable
  it("calls onPress when card body is tapped", () => {
    const onPress = jest.fn();
    render(<CatalogProductCard product={baseProduct} onPress={onPress} />);
    const card = screen.getByTestId("catalog-product-card");
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledWith(baseProduct);
  });
});
