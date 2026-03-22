/**
 * GCP-STG-0323: Fix misleading empty states on Stock, Customers, Khata screens
 *
 * When searchQuery is non-empty and results are empty, the screen should show
 * "No results for '<query>'" instead of the generic empty message.
 *
 * Test type: UNIT_TEST (static analysis — verifies search-aware empty state wiring)
 */

import * as fs from "fs";
import * as path from "path";

const stockPath = path.resolve(__dirname, "../../screens/v3/StockScreenV3.tsx");
const customersPath = path.resolve(__dirname, "../../screens/v3/CustomersScreenV3.tsx");
const khataPath = path.resolve(__dirname, "../../screens/v3/KhataScreenV3.tsx");

describe("GCP-STG-0323: Search-aware empty states", () => {
  const stockContent = fs.readFileSync(stockPath, "utf-8");
  const customersContent = fs.readFileSync(customersPath, "utf-8");
  const khataContent = fs.readFileSync(khataPath, "utf-8");

  describe("StockScreenV3", () => {
    test("shows search-specific message when searchQuery is non-empty", () => {
      expect(stockContent).toContain("searchQuery.trim() ? `No results for");
    });

    test("shows search hint subtitle when searchQuery is non-empty", () => {
      expect(stockContent).toContain('searchQuery.trim() ? "Try a different search term"');
    });

    test("preserves original empty messages for no-search case", () => {
      expect(stockContent).toContain('"No dead stock"');
      expect(stockContent).toContain('"No stock alerts"');
      expect(stockContent).toContain('"No inventory"');
    });
  });

  describe("CustomersScreenV3", () => {
    test("shows search-specific message when searchQuery is non-empty", () => {
      expect(customersContent).toContain("searchQuery.trim() ? `No results for");
    });

    test("shows search hint subtitle when searchQuery is non-empty", () => {
      expect(customersContent).toContain('searchQuery.trim() ? "Try a different search term"');
    });

    test("preserves original empty message for no-search case", () => {
      expect(customersContent).toContain('"No customers yet"');
    });
  });

  describe("KhataScreenV3", () => {
    test("shows search-specific message when searchQuery is non-empty", () => {
      expect(khataContent).toContain("searchQuery.trim() ? `No results for");
    });

    test("shows search hint subtitle when searchQuery is non-empty", () => {
      expect(khataContent).toContain('searchQuery.trim() ? "Try a different search term"');
    });

    test("preserves original empty message for no-search case", () => {
      expect(khataContent).toContain('"No credit entries"');
    });
  });
});
