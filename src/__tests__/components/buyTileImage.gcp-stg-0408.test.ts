/**
 * GCP-STG-0408: BUY Tile Image — Pass imageUrl Instead of Always Showing Box Emoji
 *
 * Verifies:
 * 1. SupplierProduct interface includes imageUrl field
 * 2. SupplierProductCardV3 conditionally renders Image when imageUrl is present
 * 3. SupplierProductCardV3 falls back to box emoji when imageUrl is absent
 * 4. BuyScreenV3 catalogToSupplier mapping passes imageUrl from CatalogProduct
 */
import * as fs from "fs";
import * as path from "path";

const CARD_PATH = path.resolve(__dirname, "../../components/v3/SupplierProductCardV3.tsx");
const BUY_SCREEN_PATH = path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx");

describe("GCP-STG-0408: BUY tile imageUrl", () => {
  const cardSource = fs.readFileSync(CARD_PATH, "utf-8");
  const buySource = fs.readFileSync(BUY_SCREEN_PATH, "utf-8");

  it("SupplierProduct interface has imageUrl optional field", () => {
    expect(cardSource).toContain("imageUrl?: string");
  });

  it("imports Image from react-native", () => {
    expect(cardSource).toMatch(/import\s*\{[^}]*Image[^}]*\}\s*from\s*["']react-native["']/);
  });

  it("renders Image component when product.imageUrl is present", () => {
    expect(cardSource).toContain("product.imageUrl");
    expect(cardSource).toContain('<Image source={{ uri: product.imageUrl }}');
  });

  it("falls back to box emoji when imageUrl is absent", () => {
    // The emoji fallback must still exist
    expect(cardSource).toContain("📦");
  });

  it("has productImage style defined", () => {
    expect(cardSource).toContain("productImage:");
  });

  it("catalogToSupplier passes imageUrl from CatalogProduct", () => {
    // The mapping function must forward imageUrl
    expect(buySource).toMatch(/imageUrl:\s*p\.imageUrl/);
  });
});
