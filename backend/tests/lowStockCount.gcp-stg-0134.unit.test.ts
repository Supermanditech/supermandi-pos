// GCP-STG-0134: Low-stock count endpoint for reorder badge
import * as fs from "fs";
import * as path from "path";

const inventoryPath = path.resolve(__dirname, "../src/routes/v1/pos/inventory.ts");
const inventoryCode = fs.readFileSync(inventoryPath, "utf-8");

const storeHubPath = path.resolve(__dirname, "../../src/screens/v3/StoreHubScreenV3.tsx");
const storeHubCode = fs.readFileSync(storeHubPath, "utf-8");

describe("GCP-STG-0134: Low-stock count endpoint", () => {
  test("GET /inventory/low-stock-count endpoint exists", () => {
    expect(inventoryCode).toContain('"/inventory/low-stock-count"');
  });

  test("requires device token auth", () => {
    // The route registration includes requireDeviceToken
    expect(inventoryCode).toContain('"/inventory/low-stock-count", requireDeviceToken');
  });

  test("queries catalog.store_products with stock check", () => {
    expect(inventoryCode).toContain("catalog.store_products sp");
    expect(inventoryCode).toContain("inventory.stock_balances sb");
  });

  test("uses reorder_policies min_threshold with fallback to 10", () => {
    expect(inventoryCode).toContain("COALESCE(rp.min_threshold, 10)");
  });

  test("returns { count: number } format", () => {
    expect(inventoryCode).toContain("res.json({ count:");
  });

  test("handles missing reorder schema gracefully (42P01)", () => {
    expect(inventoryCode).toContain('"42P01"');
    expect(inventoryCode).toContain("count: 0");
  });

  test("enforces store isolation via posDevice.storeId", () => {
    expect(inventoryCode).toContain("posDevice?.storeId");
    expect(inventoryCode).toContain("sp.store_id = $1");
  });
});

describe("GCP-STG-0134: POS Store Hub badge wiring", () => {
  test("StoreHub fetches low-stock-count from API", () => {
    expect(storeHubCode).toContain("/api/v1/pos/inventory/low-stock-count");
  });

  test("StoreHub displays count as 'X items low' badge", () => {
    expect(storeHubCode).toContain("items low");
  });

  test("falls back to 'Smart reorder' when count unavailable", () => {
    expect(storeHubCode).toContain("Smart reorder");
  });
});
