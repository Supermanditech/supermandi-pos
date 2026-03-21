// GCP-STG-0057: Stock screen Unsold/Movement tabs + field mapping fix
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

  test("search filter applies on top of tab filter", () => {
    expect(stockCode).toContain("return tabFiltered.filter");
  });

  test("useMemo depends on activeTab for re-computation", () => {
    expect(stockCode).toContain("[items, searchQuery, activeTab]");
  });

  test("empty state message is tab-specific", () => {
    expect(stockCode).toContain("No dead stock");
    expect(stockCode).toContain("No stock alerts");
    expect(stockCode).toContain("No inventory");
  });
});

describe("GCP-STG-0057: Field mapping matches real API (StockStatementItem)", () => {
  test("maps displayName (not name) for product name", () => {
    expect(stockCode).toContain("p.displayName ?? p.name");
  });

  test("maps currentStock (not quantity) for stock level", () => {
    expect(stockCode).toContain("p.currentStock");
    expect(stockCode).not.toContain("p.quantity");
  });

  test("converts purchasePrice from rupees to minor (paise)", () => {
    expect(stockCode).toContain("(p.purchasePrice ?? 0) * 100");
  });

  test("converts sellPrice from rupees to minor (paise)", () => {
    expect(stockCode).toContain("(p.sellPrice ?? 0) * 100");
  });

  test("uses hardcoded LOW_STOCK_THRESHOLD instead of non-existent API field", () => {
    expect(stockCode).toContain("LOW_STOCK_THRESHOLD = 10");
    expect(stockCode).toContain("stock <= LOW_STOCK_THRESHOLD");
    expect(stockCode).not.toContain("p.lowStockThreshold");
  });
});

describe("GCP-STG-0057: Error state with retry", () => {
  test("tracks loadError state", () => {
    expect(stockCode).toContain("const [loadError, setLoadError] = useState(false)");
  });

  test("shows error UI with retry button", () => {
    expect(stockCode).toContain("Could not load stock data");
    expect(stockCode).toContain("Retry");
    expect(stockCode).toContain("onPress={loadStock}");
  });

  test("loadStock is a useCallback (reusable for retry)", () => {
    expect(stockCode).toContain("const loadStock = useCallback(");
  });
});
