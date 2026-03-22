/**
 * GCP-STG-0315: Free-form cart discount input
 *
 * Verifies CartSheetV3 has a cart-level discount TextInput (fixed ₹ amount)
 * that integrates with cartStore's applyDiscount/removeDiscount.
 */
import * as fs from "fs";
import * as path from "path";

const SHEET_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/CartSheetV3.tsx"), "utf8"
);
const STORE_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../stores/cartStore.ts"), "utf8"
);

describe("GCP-STG-0315: Free-form cart discount input", () => {
  describe("CartSheetV3 — discount input UI", () => {
    test("has cart discount input TextInput with testID", () => {
      expect(SHEET_SRC).toContain('testID="cart-discount-input"');
    });

    test("has cart discount row with testID", () => {
      expect(SHEET_SRC).toContain('testID="cart-discount-row"');
    });

    test("has Discount label", () => {
      expect(SHEET_SRC).toContain("Discount ₹");
    });

    test("uses numeric keyboard for discount input", () => {
      expect(SHEET_SRC).toContain('keyboardType="numeric"');
    });

    test("has accessibility label on discount input", () => {
      expect(SHEET_SRC).toContain('accessibilityLabel="Cart discount amount"');
    });

    test("has maxLength limit on discount input", () => {
      expect(SHEET_SRC).toContain("maxLength={7}");
    });

    test("has cartDiscountInput local state", () => {
      expect(SHEET_SRC).toContain("cartDiscountInput");
      expect(SHEET_SRC).toContain("setCartDiscountInput");
    });

    test("has handleCartDiscountChange callback", () => {
      expect(SHEET_SRC).toContain("handleCartDiscountChange");
    });

    test("sanitizes input to digits and decimal only", () => {
      expect(SHEET_SRC).toContain('replace(/[^0-9.]/g, "")');
    });

    test("calls applyDiscount with type fixed and minor amount", () => {
      expect(SHEET_SRC).toContain('applyDiscount({ type: "fixed", value: minorAmount');
    });

    test("calls removeDiscount when input cleared", () => {
      expect(SHEET_SRC).toContain("removeDiscount()");
    });

    test("shows discount applied summary when discountAmount > 0", () => {
      expect(SHEET_SRC).toContain("Discount applied");
      expect(SHEET_SRC).toContain("discountAmount > 0");
    });

    test("cartDiscountInput style exists", () => {
      expect(SHEET_SRC).toContain("cartDiscountInput:");
    });

    test("cartDiscountRow style exists", () => {
      expect(SHEET_SRC).toContain("cartDiscountRow:");
    });

    test("cartDiscountLabel style exists", () => {
      expect(SHEET_SRC).toContain("cartDiscountLabel:");
    });
  });

  describe("cartStore — discount support", () => {
    test("has applyDiscount action", () => {
      expect(STORE_SRC).toContain("applyDiscount:");
    });

    test("has removeDiscount action", () => {
      expect(STORE_SRC).toContain("removeDiscount:");
    });

    test("has CartDiscount interface with fixed type", () => {
      expect(STORE_SRC).toContain("export interface CartDiscount");
      expect(STORE_SRC).toContain("'fixed'");
    });

    test("calculateCartTotals handles cart discount", () => {
      expect(STORE_SRC).toContain("cartDiscountAmount");
    });

    test("discountAmount is recalculated on applyDiscount", () => {
      expect(STORE_SRC).toContain("recalculate()");
    });
  });
});
