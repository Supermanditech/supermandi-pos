/**
 * GCP-STG-0286: purchase_order_items must have store_id + RLS
 */
import * as fs from "fs";
import * as path from "path";

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../migrations/218_gcp_stg_0286_poi_store_id_rls.sql"), "utf8"
);

const ORDERS_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/orders.ts"), "utf8"
);

const REORDER_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/reorder.ts"), "utf8"
);

const PO_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/retailer-admin/purchaseOrders.ts"), "utf8"
);

describe("GCP-STG-0286: purchase_order_items store_id + RLS", () => {
  test("migration adds store_id column", () => {
    expect(MIGRATION).toContain("ADD COLUMN IF NOT EXISTS store_id UUID");
  });

  test("migration backfills store_id from parent purchase_orders", () => {
    expect(MIGRATION).toContain("SET store_id = po.store_id");
    expect(MIGRATION).toContain("FROM orders.purchase_orders po");
  });

  test("migration sets NOT NULL after backfill", () => {
    expect(MIGRATION).toContain("ALTER COLUMN store_id SET NOT NULL");
  });

  test("migration enables RLS with policy", () => {
    expect(MIGRATION).toContain("ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).toContain("rls_purchase_order_items_store");
    expect(MIGRATION).toContain("rls_store_check(store_id)");
  });

  test("orders.ts INSERT includes store_id", () => {
    expect(ORDERS_SRC).toContain("id, order_id, store_id, supplier_product_id");
  });

  test("reorder.ts INSERTs include store_id", () => {
    // All 3 reorder INSERT sites must have store_id
    const matches = REORDER_SRC.match(/order_id, store_id, supplier_product_id/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(3);
  });

  test("purchaseOrders.ts INSERT includes store_id", () => {
    expect(PO_SRC).toContain("order_id, store_id, supplier_product_id");
  });

  test("purchaseOrders.ts GET detail query filters items by store_id", () => {
    // The items query must include poi.store_id = $2 for store isolation
    expect(PO_SRC).toContain("poi.order_id = $1 AND poi.store_id = $2");
  });
});
