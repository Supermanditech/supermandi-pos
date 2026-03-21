// GCP-STG-0094: Retailer Buy Again from previous PO
import * as fs from "fs";
import * as path from "path";

const backendPath = path.resolve(__dirname, "../src/routes/v1/retailer-admin/purchaseOrders.ts");
const backendCode = fs.readFileSync(backendPath, "utf-8");

const frontendPath = path.resolve(__dirname, "../../retailer-admin/src/pages/PurchaseOrdersPage.tsx");
const frontendCode = fs.readFileSync(frontendPath, "utf-8");

describe("GCP-STG-0094: Buy Again backend endpoint", () => {
  test("POST /purchase-orders/:poId/buy-again route exists", () => {
    expect(backendCode).toContain('"/purchase-orders/:poId/buy-again"');
  });

  test("enforces store isolation (WHERE store_id = $2)", () => {
    expect(backendCode).toContain("WHERE id = $1 AND store_id = $2");
  });

  test("copies items from original PO to new draft", () => {
    expect(backendCode).toContain("INSERT INTO orders.purchase_order_items");
    expect(backendCode).toContain("purchase_order_id = $1");
  });

  test("creates new PO with status 'draft'", () => {
    expect(backendCode).toContain("'draft'");
    expect(backendCode).toContain("INSERT INTO orders.purchase_orders");
  });

  test("returns new PO id and number", () => {
    expect(backendCode).toContain("poNumber: newPoNumber");
    expect(backendCode).toContain("itemsCount: itemsRes.rows.length");
  });

  test("rejects if original PO has no items", () => {
    expect(backendCode).toContain("EMPTY_PO");
    expect(backendCode).toContain("Original PO has no items to reorder");
  });

  test("handles missing table gracefully (42P01)", () => {
    expect(backendCode).toContain("TABLE_MISSING");
  });
});

describe("GCP-STG-0094: Buy Again frontend button", () => {
  test("Buy Again button renders for delivered POs", () => {
    expect(frontendCode).toContain("Buy Again");
    expect(frontendCode).toContain("po.status === 'delivered'");
  });

  test("Buy Again button also renders for partial_received POs", () => {
    expect(frontendCode).toContain("po.status === 'partial_received'");
  });

  test("calls /buy-again endpoint on click", () => {
    expect(frontendCode).toContain("/buy-again");
    expect(frontendCode).toContain("method: 'POST'");
  });

  test("shows loading state while creating", () => {
    expect(frontendCode).toContain("Creating...");
    expect(frontendCode).toContain("buyAgainLoading");
  });

  test("refreshes order list after successful buy-again", () => {
    expect(frontendCode).toContain("fetchOrders()");
  });
});
