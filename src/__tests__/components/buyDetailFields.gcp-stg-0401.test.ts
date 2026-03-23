/**
 * GCP-STG-0401: BUY Detail Sheet Missing 6 Fields from SupplierProduct
 *
 * Verifies ProductDetailSheetV3 ProcurementData includes all 6 fields
 * (deliveryTerms, financeEligible, publishedTermsVersion, moqTiers,
 * procurementUnit, procurementPackQty) and that BuyScreenV3 maps them.
 */
import * as fs from "fs";
import * as path from "path";

const DETAIL_SHEET_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/ProductDetailSheetV3.tsx"), "utf8"
);
const BUY_SCREEN_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx"), "utf8"
);

describe("GCP-STG-0401: BUY Detail Sheet 6 missing procurement fields", () => {
  describe("ProcurementData interface", () => {
    test("includes deliveryTerms field", () => {
      expect(DETAIL_SHEET_SRC).toContain("deliveryTerms?: string");
    });
    test("includes financeEligible field", () => {
      expect(DETAIL_SHEET_SRC).toContain("financeEligible?: boolean");
    });
    test("includes publishedTermsVersion field", () => {
      expect(DETAIL_SHEET_SRC).toContain("publishedTermsVersion?: number");
    });
    test("includes moqTiers field", () => {
      expect(DETAIL_SHEET_SRC).toContain("moqTiers?:");
    });
    test("includes procurementUnit field", () => {
      expect(DETAIL_SHEET_SRC).toContain("procurementUnit?: string");
    });
    test("includes procurementPackQty field", () => {
      expect(DETAIL_SHEET_SRC).toContain("procurementPackQty?: number");
    });
  });

  describe("ProductDetailSheetV3 — display elements", () => {
    test("renders deliveryTerms text line", () => {
      expect(DETAIL_SHEET_SRC).toContain("Delivery Terms");
      expect(DETAIL_SHEET_SRC).toContain("procurement.deliveryTerms");
    });
    test("renders financeEligible badge with 'Credit Available'", () => {
      expect(DETAIL_SHEET_SRC).toContain("Credit Available");
      expect(DETAIL_SHEET_SRC).toContain('testID="finance-eligible-badge"');
    });
    test("renders publishedTermsVersion as v{N} label", () => {
      expect(DETAIL_SHEET_SRC).toContain('testID="terms-version-label"');
      expect(DETAIL_SHEET_SRC).toMatch(/v\{procurement\.publishedTermsVersion\}/);
    });
    test("renders moqTiers breakdown", () => {
      expect(DETAIL_SHEET_SRC).toContain("MOQ Tiers");
      expect(DETAIL_SHEET_SRC).toContain("procurement.moqTiers");
      expect(DETAIL_SHEET_SRC).toContain("tier.minQty");
      expect(DETAIL_SHEET_SRC).toContain("tier.discountPct");
    });
    test("renders procurementUnit as 'Ships As' label", () => {
      expect(DETAIL_SHEET_SRC).toContain("Ships As");
      expect(DETAIL_SHEET_SRC).toContain('testID="procurement-unit-label"');
      expect(DETAIL_SHEET_SRC).toContain("procurement.procurementUnit");
    });
    test("renders procurementPackQty as 'Pack Size' label", () => {
      expect(DETAIL_SHEET_SRC).toContain("Pack Size");
      expect(DETAIL_SHEET_SRC).toContain('testID="procurement-pack-label"');
      expect(DETAIL_SHEET_SRC).toContain("procurement.procurementPackQty");
    });
  });

  describe("BuyScreenV3 — procurement mapping", () => {
    test("maps deliveryTerms from detailProduct", () => {
      expect(BUY_SCREEN_SRC).toContain("deliveryTerms: detailProduct.deliveryTerms");
    });
    test("maps financeEligible from detailProduct", () => {
      expect(BUY_SCREEN_SRC).toContain("financeEligible: detailProduct.financeEligible");
    });
    test("maps publishedTermsVersion from detailProduct", () => {
      expect(BUY_SCREEN_SRC).toContain("publishedTermsVersion: detailProduct.publishedTermsVersion");
    });
    test("maps moqTiers from detailProduct", () => {
      expect(BUY_SCREEN_SRC).toContain("moqTiers: detailProduct.moqTiers");
    });
    test("maps procurementUnit from detailProduct", () => {
      expect(BUY_SCREEN_SRC).toContain("procurementUnit: detailProduct.procurementUnit");
    });
    test("maps procurementPackQty from detailProduct", () => {
      expect(BUY_SCREEN_SRC).toContain("procurementPackQty: detailProduct.procurementPackQty");
    });
  });
});
