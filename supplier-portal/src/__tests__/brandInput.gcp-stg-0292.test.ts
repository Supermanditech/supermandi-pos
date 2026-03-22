/**
 * @jest-environment node
 */
/**
 * GCP-STG-0292: Brand input field in supplier product form
 *
 * Verifies brand field exists in ProductInput type, Product type,
 * form initialization, edit pre-fill, reset, and the form UI.
 */
import * as fs from "fs";
import * as path from "path";

const API_SRC = fs.readFileSync(
  path.resolve(__dirname, "../lib/api.ts"), "utf8"
);
const PAGE_SRC = fs.readFileSync(
  path.resolve(__dirname, "../app/(dashboard)/products/page.tsx"), "utf8"
);

describe("GCP-STG-0292: Brand input in supplier product form", () => {
  describe("TypeScript types", () => {
    test("ProductInput interface has brand field", () => {
      const productInputBlock = API_SRC.split("export interface ProductInput")[1]?.split("}")[0] || "";
      expect(productInputBlock).toContain("brand?:");
    });

    test("Product interface has brand field", () => {
      const productBlock = API_SRC.split("export interface Product {")[1]?.split("}")[0] || "";
      expect(productBlock).toContain("brand?:");
    });
  });

  describe("Form initialization", () => {
    test("formData initial state includes brand: empty string", () => {
      // The first useState<ProductInput>({ ... }) block
      const initBlock = PAGE_SRC.split("useState<ProductInput>({")[1]?.split("});")[0] || "";
      expect(initBlock).toContain("brand:");
    });

    test("edit pre-fill reads product.brand", () => {
      expect(PAGE_SRC).toContain("brand: product.brand");
    });

    test("reset form includes brand: empty string", () => {
      // Count brand: '' occurrences — should be at least 2 (init + reset)
      const matches = PAGE_SRC.match(/brand:\s*['"]{2}/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Form UI", () => {
    test("brand input field exists with correct id and name", () => {
      expect(PAGE_SRC).toContain('id="product-brand"');
      expect(PAGE_SRC).toContain('name="brand"');
    });

    test("brand input has label", () => {
      expect(PAGE_SRC).toContain('htmlFor="product-brand"');
      expect(PAGE_SRC).toContain(">Brand<");
    });

    test("brand input has placeholder", () => {
      expect(PAGE_SRC).toContain("Tata, Amul, Patanjali");
    });

    test("brand input has maxLength", () => {
      expect(PAGE_SRC).toContain("maxLength={100}");
    });

    test("brand input uses handleChange", () => {
      // The brand input should use the shared handleChange
      const brandSection = PAGE_SRC.split('id="product-brand"')[1]?.split("</div>")[0] || "";
      expect(brandSection).toContain("onChange={handleChange}");
    });
  });
});
