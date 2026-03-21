// GCP-STG-0094: Buy Again — verified against 006_orders_schema.sql
import * as fs from "fs";
import * as path from "path";

const backendPath = path.resolve(__dirname, "../src/routes/v1/retailer-admin/purchaseOrders.ts");
const backendCode = fs.readFileSync(backendPath, "utf-8");

const migrationPath = path.resolve(__dirname, "../migrations/006_orders_schema.sql");
const migrationCode = fs.readFileSync(migrationPath, "utf-8");

const frontendPath = path.resolve(__dirname, "../../retailer-admin/src/pages/PurchaseOrdersPage.tsx");
const frontendCode = fs.readFileSync(frontendPath, "utf-8");

describe("GCP-STG-0094: Buy Again — schema parity with 006_orders_schema.sql", () => {
  // Extract column names from migration to verify code uses correct ones
  const poColumns = migrationCode.slice(
    migrationCode.indexOf("TABLE: orders.purchase_orders"),
    migrationCode.indexOf("TABLE: orders.purchase_order_items")
  );
  const itemColumns = migrationCode.slice(
    migrationCode.indexOf("TABLE: orders.purchase_order_items")
  );

  test("schema has order_number (NOT po_number)", () => {
    expect(poColumns).toContain("order_number");
    expect(poColumns).not.toMatch(/\bpo_number\b/);
  });

  test("schema has total_amount (NOT total_minor)", () => {
    expect(poColumns).toContain("total_amount");
  });

  test("schema has store_notes (NOT notes)", () => {
    expect(poColumns).toContain("store_notes");
  });

  test("schema has ordered_quantity (NOT quantity)", () => {
    expect(itemColumns).toContain("ordered_quantity");
  });

  test("schema has unit_price (NOT unit_price_minor)", () => {
    expect(itemColumns).toContain("unit_price INTEGER");
  });

  test("schema FK is order_id (NOT purchase_order_id)", () => {
    expect(itemColumns).toContain("order_id UUID NOT NULL REFERENCES orders.purchase_orders");
  });

  test("code SELECT uses order_id (not purchase_order_id)", () => {
    expect(backendCode).toContain("WHERE order_id = $1");
    expect(backendCode).not.toContain("purchase_order_id = $1");
  });

  test("code SELECT uses ordered_quantity (not quantity)", () => {
    expect(backendCode).toContain("ordered_quantity");
    // Verify the old wrong name is not in buy-again section
    const buyAgainSection = backendCode.slice(backendCode.indexOf("buy-again"));
    expect(buyAgainSection).not.toMatch(/\bquantity\b[^_]/); // quantity without _ prefix = wrong
  });

  test("code INSERT uses order_number (not po_number)", () => {
    const buyAgainSection = backendCode.slice(backendCode.indexOf("buy-again"));
    expect(buyAgainSection).toContain("order_number");
    expect(buyAgainSection).not.toContain("po_number");
  });

  test("code INSERT uses total_amount (not total_minor)", () => {
    const buyAgainSection = backendCode.slice(backendCode.indexOf("buy-again"));
    expect(buyAgainSection).toContain("total_amount");
  });

  test("code INSERT uses store_notes (not notes)", () => {
    const buyAgainSection = backendCode.slice(backendCode.indexOf("buy-again"));
    expect(buyAgainSection).toContain("store_notes");
  });

  test("code does NOT reference non-existent columns (sort_order, items_count, unit)", () => {
    const buyAgainSection = backendCode.slice(backendCode.indexOf("buy-again"));
    expect(buyAgainSection).not.toContain("sort_order");
    expect(buyAgainSection).not.toContain("items_count");
    // 'unit' as a standalone column in INSERT — but unit_price is OK
    expect(buyAgainSection).not.toMatch(/,\s*unit\s*[,)]/);
  });
});

describe("GCP-STG-0094: Buy Again frontend", () => {
  test("Buy Again button on delivered/partial_received POs", () => {
    expect(frontendCode).toContain("Buy Again");
    expect(frontendCode).toContain("po.status === 'delivered'");
    expect(frontendCode).toContain("po.status === 'partial_received'");
  });

  test("calls POST /buy-again endpoint", () => {
    expect(frontendCode).toContain("/buy-again");
    expect(frontendCode).toContain("method: 'POST'");
  });

  test("loading state + list refresh on success", () => {
    expect(frontendCode).toContain("Creating...");
    expect(frontendCode).toContain("fetchOrders()");
  });
});
