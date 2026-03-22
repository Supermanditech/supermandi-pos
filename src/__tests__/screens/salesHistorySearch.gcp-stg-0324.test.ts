/**
 * GCP-STG-0324: SalesHistoryV3 search + payment filter
 *
 * Validates:
 * 1. Search bar and payment filter chips exist in the component
 * 2. filteredSales logic: billRef partial match, amount exact match, paymentMode filter
 * 3. Empty state adapts to active search/filter
 * 4. testIDs present for automation
 */

import { readFileSync } from "fs";
import { join } from "path";

const componentPath = join(
  __dirname,
  "..",
  "..",
  "screens",
  "v3",
  "SalesHistoryScreenV3.tsx"
);
const src = readFileSync(componentPath, "utf-8");

describe("GCP-STG-0324: SalesHistoryV3 search + payment filter", () => {
  // --- UI elements ---
  describe("UI elements", () => {
    it("has a TextInput for search", () => {
      expect(src).toContain("TextInput");
      expect(src).toContain('testID="sales-search-input"');
    });

    it("has a clear button for the search input", () => {
      expect(src).toContain('testID="sales-search-clear"');
    });

    it("has payment filter chips for All, CASH, UPI, DUE", () => {
      expect(src).toContain('testID={`payment-chip-${mode ?? "all"}`}');
      // Verify all modes are rendered
      expect(src).toContain('[null, "CASH", "UPI", "DUE"]');
    });

    it("has searchQuery state", () => {
      expect(src).toMatch(/useState.*searchQuery/s);
      expect(src).toContain('const [searchQuery, setSearchQuery] = useState("")');
    });

    it("has paymentFilter state", () => {
      expect(src).toMatch(/useState.*paymentFilter/s);
      expect(src).toContain(
        "const [paymentFilter, setPaymentFilter] = useState<string | null>(null)"
      );
    });
  });

  // --- Filtering logic ---
  describe("filtering logic", () => {
    it("filters by paymentMode when paymentFilter is set", () => {
      expect(src).toContain(
        "s.paymentMode.toUpperCase() === paymentFilter"
      );
    });

    it("matches billRef partially (case-insensitive)", () => {
      expect(src).toContain("s.billRef.toLowerCase().includes(q)");
    });

    it("matches amount exactly in rupees (totalMinor / 100)", () => {
      // Converts query to minor: parseFloat(q) * 100
      expect(src).toContain("Math.round(qNum * 100)");
      expect(src).toContain("s.totalMinor === amountMatch");
    });

    it("FlatList uses filteredSales, not raw sales", () => {
      expect(src).toContain("data={filteredSales}");
      // Ensure the old raw data binding is gone
      expect(src).not.toContain("data={sales}");
    });
  });

  // --- Empty state ---
  describe("empty state adapts to search", () => {
    it('shows "No matching sales" when search or filter is active', () => {
      expect(src).toContain("No matching sales");
      expect(src).toContain("Try a different search or filter");
    });

    it('shows "No sales yet" when no search is active', () => {
      expect(src).toContain("No sales yet");
      expect(src).toContain("Complete a sale to see it here");
    });
  });

  // --- Styles ---
  describe("styles", () => {
    it("has searchRow style", () => {
      expect(src).toContain("searchRow:");
    });

    it("has searchInput style", () => {
      expect(src).toContain("searchInput:");
    });

    it("has chip styles", () => {
      expect(src).toContain("chipRow:");
      expect(src).toContain("chip:");
      expect(src).toContain("chipActive:");
      expect(src).toContain("chipText:");
      expect(src).toContain("chipTextActive:");
    });
  });

  // --- Search bar placement ---
  describe("layout order", () => {
    it("search bar appears after date filter row", () => {
      const filterRowIdx = src.indexOf("filterRow}");
      const searchRowIdx = src.indexOf("searchRow}");
      expect(filterRowIdx).toBeGreaterThan(-1);
      expect(searchRowIdx).toBeGreaterThan(-1);
      expect(searchRowIdx).toBeGreaterThan(filterRowIdx);
    });

    it("payment chips appear after search bar", () => {
      const searchRowIdx = src.indexOf("searchRow}");
      const chipRowIdx = src.indexOf("chipRow}");
      expect(chipRowIdx).toBeGreaterThan(searchRowIdx);
    });
  });
});
