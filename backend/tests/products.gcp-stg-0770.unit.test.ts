/**
 * GCP-STG-0770: products.ts uses only inventory.stock_balances, no store_inventory fallback
 */
describe("GCP-STG-0770: No store_inventory fallback", () => {
  const fs = require("fs");
  const products = fs.readFileSync("src/routes/products.ts", "utf8");

  it("should use inventory.stock_balances for stock queries", () => {
    expect(products).toContain("inventory.stock_balances");
  });

  it("should NOT join store_inventory table", () => {
    expect(products).not.toContain("JOIN store_inventory");
    expect(products).not.toContain("FROM store_inventory");
  });

  it("should not reference store_inventory in SQL queries (comments OK)", () => {
    // Split into lines, check non-comment lines
    const lines = products.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      if (trimmed.includes("store_inventory")) {
        // Should not appear in SQL template literals
        expect(trimmed).not.toMatch(/`.*store_inventory/);
      }
    }
  });
});
