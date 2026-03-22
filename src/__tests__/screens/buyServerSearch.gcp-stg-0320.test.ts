/**
 * GCP-STG-0320: BUY Search Should Use Server-Side Query Instead of Client-Only Filter
 *
 * Verifies that BuyScreenV3 sends search queries to the server via getBuyCatalog
 * with q= parameter, using 300ms debounce, instead of only filtering client-side.
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx"),
  "utf8"
);

describe("GCP-STG-0320: BUY server-side search", () => {
  test("calls getBuyCatalog with q parameter for server search", () => {
    // The server search effect must pass q: trimmed to getBuyCatalog
    expect(SRC).toContain("getBuyCatalog(storeId, { q: trimmed");
  });

  test("uses 300ms debounce for search requests", () => {
    // Must debounce server calls to avoid excessive API hits
    expect(SRC).toContain("searchDebounceRef");
    expect(SRC).toContain("}, 300)");
  });

  test("clears debounce timer on new input", () => {
    expect(SRC).toContain("clearTimeout(searchDebounceRef.current)");
  });

  test("uses useRef for debounce timer (not useState)", () => {
    expect(SRC).toContain("searchDebounceRef = useRef<");
  });

  test("has serverSearchResults state for server response", () => {
    expect(SRC).toContain("serverSearchResults");
    expect(SRC).toContain("setServerSearchResults");
  });

  test("filteredProducts uses serverSearchResults when available", () => {
    // When server results exist, use them instead of full catalog
    expect(SRC).toContain("serverSearchResults !== null ? serverSearchResults : products");
  });

  test("clears server results when search query is short/empty", () => {
    // When query < 2 chars, revert to full catalog
    expect(SRC).toContain("setServerSearchResults(null)");
    expect(SRC).toContain("trimmed.length < 2");
  });

  test("does NOT use client-side name/brand filter on searchQuery", () => {
    // The old client-side filter should be removed — no more
    // list.filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q))
    expect(SRC).not.toContain(
      'p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)'
    );
  });

  test("shows search loading indicator", () => {
    expect(SRC).toContain("searchLoading");
    expect(SRC).toContain("buy-search-loading");
  });

  test("minimum 2-character threshold before server call", () => {
    // getBuyCatalog already enforces q.trim().length >= 2, but BuyScreenV3
    // should also guard to avoid unnecessary API calls
    expect(SRC).toContain("trimmed.length < 2");
  });
});
