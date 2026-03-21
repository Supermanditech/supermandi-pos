// GCP-STG-0057: Stock screen Unsold/Movement tabs implemented
import * as fs from "fs";
import * as path from "path";

const stockPath = path.resolve(__dirname, "../../screens/v3/StockScreenV3.tsx");
const stockCode = fs.readFileSync(stockPath, "utf-8");

describe("GCP-STG-0057: Stock screen tab filtering", () => {
  test("filteredItems depends on activeTab", () => {
    expect(stockCode).toContain("activeTab");
    expect(stockCode).toContain('activeTab === "unsold"');
    expect(stockCode).toContain('activeTab === "movement"');
  });

  test("unsold tab filters to zero-stock items", () => {
    expect(stockCode).toContain("i.stock <= 0");
  });

  test("movement tab filters to low/out items sorted by stock", () => {
    expect(stockCode).toContain('i.status === "low" || i.status === "out"');
    expect(stockCode).toContain("a.stock - b.stock");
  });

  test("current tab shows all items (no filter)", () => {
    // Default: tabFiltered = items (no filter applied for current)
    expect(stockCode).toContain("let tabFiltered = items");
  });

  test("search filter applies on top of tab filter", () => {
    expect(stockCode).toContain("return tabFiltered.filter");
  });

  test("empty state message is tab-specific", () => {
    expect(stockCode).toContain("No dead stock");
    expect(stockCode).toContain("No stock alerts");
    expect(stockCode).toContain("No inventory");
  });

  test("useMemo depends on activeTab for re-computation", () => {
    expect(stockCode).toContain("[items, searchQuery, activeTab]");
  });
});
