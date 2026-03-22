/**
 * GCP-STG-0312: Manual quantity TextInput in cart
 *
 * Verifies CartItemRowV3 has tappable qty that switches to TextInput,
 * and CartSheetV3 wires onQuantityChange to updateQuantity.
 */
import * as fs from "fs";
import * as path from "path";

const ROW_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/CartItemRowV3.tsx"), "utf8"
);
const SHEET_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/CartSheetV3.tsx"), "utf8"
);

describe("GCP-STG-0312: Manual quantity input in cart", () => {
  describe("CartItemRowV3", () => {
    test("has onQuantityChange prop in type definition", () => {
      expect(ROW_SRC).toContain("onQuantityChange?: (qty: number) => void");
    });

    test("has editingQty state for toggle", () => {
      expect(ROW_SRC).toContain("useState(false)");
      expect(ROW_SRC).toContain("editingQty");
    });

    test("renders TextInput when editingQty is true", () => {
      expect(ROW_SRC).toContain("<TextInput");
      expect(ROW_SRC).toContain("keyboardType=\"decimal-pad\"");
      expect(ROW_SRC).toContain("autoFocus");
    });

    test("renders Pressable around qty text when not editing", () => {
      expect(ROW_SRC).toContain("<Pressable onPress=");
      expect(ROW_SRC).toContain("setEditingQty(true)");
    });

    test("calls onQuantityChange on blur with parsed float", () => {
      expect(ROW_SRC).toContain("parseFloat(qtyInput)");
      expect(ROW_SRC).toContain("onQuantityChange(parsed)");
    });

    test("validates qty > 0 and isFinite before calling onQuantityChange", () => {
      expect(ROW_SRC).toContain("parsed > 0");
      expect(ROW_SRC).toContain("Number.isFinite(parsed)");
    });

    test("calls onQuantityChange on submit (Enter key)", () => {
      expect(ROW_SRC).toContain("onSubmitEditing");
    });

    test("has accessibility label on TextInput", () => {
      expect(ROW_SRC).toContain('accessibilityLabel="Enter quantity"');
    });
  });

  describe("CartSheetV3 wiring", () => {
    test("passes onQuantityChange to CartItemRowV3", () => {
      expect(SHEET_SRC).toContain("onQuantityChange=");
    });

    test("onQuantityChange calls updateQuantity with item.id", () => {
      expect(SHEET_SRC).toContain("updateQuantity(item.id, qty)");
    });
  });
});
