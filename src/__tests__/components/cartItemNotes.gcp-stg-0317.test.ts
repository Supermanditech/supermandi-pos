/**
 * GCP-STG-0317: Per-item notes in cart
 *
 * Verifies:
 * - CartItem type has `notes?: string` field
 * - cartStore has setItemNotes action (max 100 chars, trim, locked guard)
 * - CartSheetV3 edit modal has notes TextInput wired to setItemNotes
 * - CartItemRowV3 displays notes when present
 */
import * as fs from "fs";
import * as path from "path";

const STORE_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../stores/cartStore.ts"), "utf8"
);
const SHEET_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/CartSheetV3.tsx"), "utf8"
);
const ROW_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/CartItemRowV3.tsx"), "utf8"
);

describe("GCP-STG-0317: Per-item notes in cart", () => {
  describe("CartItem type", () => {
    test("has optional notes field", () => {
      expect(STORE_SRC).toContain("notes?: string;");
    });
  });

  describe("cartStore — setItemNotes action", () => {
    test("setItemNotes declared in CartState interface", () => {
      expect(STORE_SRC).toContain("setItemNotes: (itemId: string, notes: string) => void");
    });

    test("setItemNotes implementation exists", () => {
      expect(STORE_SRC).toContain("setItemNotes: (itemId, notes) =>");
    });

    test("respects cart lock", () => {
      expect(STORE_SRC).toMatch(/setItemNotes:.*\n.*if \(get\(\)\.locked\) return/);
    });

    test("caps notes at 100 characters", () => {
      expect(STORE_SRC).toContain("notes.slice(0, 100)");
    });

    test("trims whitespace", () => {
      expect(STORE_SRC).toContain(".trim()");
    });

    test("clears notes when empty string after trim", () => {
      expect(STORE_SRC).toContain("trimmed || undefined");
    });
  });

  describe("CartSheetV3 — edit modal notes input", () => {
    test("has editItemNotes state", () => {
      expect(SHEET_SRC).toContain("editItemNotes");
      expect(SHEET_SRC).toContain("setEditItemNotes");
    });

    test("selects setItemNotes from store", () => {
      expect(SHEET_SRC).toContain("useCartStore((s) => s.setItemNotes)");
    });

    test("initializes editItemNotes from item.notes on modal open", () => {
      expect(SHEET_SRC).toContain('setEditItemNotes(item.notes ?? "")');
    });

    test("renders TextInput for notes with testID", () => {
      expect(SHEET_SRC).toContain('testID="cart-edit-item-notes"');
    });

    test("has placeholder text for notes", () => {
      expect(SHEET_SRC).toContain("Add note (e.g. no ice, extra spicy)");
    });

    test("limits notes input to 100 characters", () => {
      expect(SHEET_SRC).toContain("maxLength={100}");
    });

    test("calls setItemNotes on save", () => {
      expect(SHEET_SRC).toContain("setItemNotes(editingItem.id, editItemNotes)");
    });

    test("editItemNotes is in handleSaveEdit dependency array", () => {
      // The useCallback deps should include editItemNotes and setItemNotes
      expect(SHEET_SRC).toContain("editItemNotes");
      expect(SHEET_SRC).toContain("setItemNotes");
    });
  });

  describe("CartItemRowV3 — notes display", () => {
    test("renders notes text when item.notes is truthy", () => {
      expect(ROW_SRC).toContain("item.notes");
      expect(ROW_SRC).toContain('testID="cart-item-note"');
    });

    test("uses italic style for notes", () => {
      expect(ROW_SRC).toContain("noteLabel");
      expect(ROW_SRC).toContain('fontStyle: "italic"');
    });

    test("limits notes display to 1 line", () => {
      expect(ROW_SRC).toContain("numberOfLines={1}");
    });

    test("noteLabel has subtle text color (textTertiary)", () => {
      expect(ROW_SRC).toContain("color: colors.textTertiary");
    });

    test("noteLabel fontSize is at least 11px (GCP-STG-0307 compliance)", () => {
      const match = ROW_SRC.match(/noteLabel:.*fontSize:\s*(\d+)/);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThanOrEqual(11);
    });
  });
});
