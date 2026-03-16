/**
 * STG-560: UniversalSearchV3 — context-aware search
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-560: UniversalSearchV3", () => {
  test("supports sell and buy contexts", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/UniversalSearchV3.tsx"), "utf8");
    expect(src).toContain('"sell"');
    expect(src).toContain('"buy"');
    expect(src).toContain("SearchContext");
    expect(src).toContain("STORE PRODUCTS");
    expect(src).toContain("SUPPLIER CATALOGUE");
  });

  test("has search input with clear and cancel", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/UniversalSearchV3.tsx"), "utf8");
    expect(src).toContain("TextInput");
    expect(src).toContain("clearBtn");
    expect(src).toContain("Cancel");
    expect(src).toContain("onQueryChange");
  });

  test("shows recent searches when query empty", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/UniversalSearchV3.tsx"), "utf8");
    expect(src).toContain("RECENT SEARCHES");
    expect(src).toContain("RECENT_SEARCHES_SELL");
    expect(src).toContain("RECENT_SEARCHES_BUY");
    expect(src).toContain("chipRow");
  });

  test("sell results show stock, buy results show supplier and margin", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/UniversalSearchV3.tsx"), "utf8");
    expect(src).toContain("item.stock");
    expect(src).toContain("item.supplier");
    expect(src).toContain("item.margin");
    expect(src).toContain("+ Add");
    expect(src).toContain("Select");
  });

  test("SearchResult interface has wholesale fields", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/UniversalSearchV3.tsx"), "utf8");
    expect(src).toContain("supplier?: string");
    expect(src).toContain("margin?: number");
    expect(src).toContain("caseSize?: number");
  });
});
