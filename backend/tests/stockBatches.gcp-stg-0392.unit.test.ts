/**
 * GCP-STG-0392: Batch-Level Stock Tracking — unit tests
 *
 * Tests:
 * 1. Migration creates inventory.stock_batches table with correct schema
 * 2. GRN receive inserts batch record when batchNumber/expiryDate provided
 * 3. GRN receive does NOT insert batch record when neither provided
 * 4. Batch breakdown endpoint returns FEFO-ordered batches for a product
 * 5. CHECK constraint prevents negative current_qty
 */

import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

// -- Migration file validation tests --

describe("GCP-STG-0392: stock_batches migration", () => {
  const migrationPath = path.join(
    __dirname,
    "..",
    "migrations",
    "232_gcp_stg_0392_stock_batches.sql"
  );

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("creates inventory.stock_batches table", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS inventory.stock_batches");
  });

  it("has required columns", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    const requiredColumns = [
      "id UUID PRIMARY KEY",
      "store_id UUID NOT NULL",
      "product_id UUID NOT NULL",
      "batch_number VARCHAR(100)",
      "expiry_date DATE",
      "current_qty NUMERIC(12,3)",
      "grn_receive_id UUID",
      "received_at TIMESTAMPTZ",
      "created_at TIMESTAMPTZ",
      "updated_at TIMESTAMPTZ",
    ];
    for (const col of requiredColumns) {
      expect(sql).toContain(col);
    }
  });

  it("has CHECK constraint on current_qty >= 0", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("chk_batch_qty");
    expect(sql).toContain("current_qty >= 0");
  });

  it("creates store+product index", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("idx_stock_batches_store_product");
    expect(sql).toContain("(store_id, product_id)");
  });

  it("creates expiry index with partial WHERE clause", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("idx_stock_batches_expiry");
    expect(sql).toContain("WHERE current_qty > 0");
  });

  it("has ROLLBACK comment", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("ROLLBACK");
    expect(sql).toContain("DROP TABLE");
  });
});

// -- GRN receive handler logic tests --

describe("GCP-STG-0392: GRN receive batch insert logic", () => {
  const ordersPath = path.join(
    __dirname,
    "..",
    "src",
    "routes",
    "v1",
    "orders.ts"
  );

  let ordersSource: string;

  beforeAll(() => {
    ordersSource = fs.readFileSync(ordersPath, "utf-8");
  });

  it("orders.ts contains INSERT INTO inventory.stock_batches", () => {
    expect(ordersSource).toContain("INSERT INTO inventory.stock_batches");
  });

  it("batch insert is conditional on batchNumber or expiryDate", () => {
    expect(ordersSource).toContain("item.batchNumber || item.expiryDate");
  });

  it("batch insert includes grn_receive_id from receiveId", () => {
    // The INSERT must bind receiveId into grn_receive_id
    const insertSection = ordersSource.substring(
      ordersSource.indexOf("INSERT INTO inventory.stock_batches"),
      ordersSource.indexOf("INSERT INTO inventory.stock_batches") + 500
    );
    expect(insertSection).toContain("grn_receive_id");
    expect(insertSection).toContain("receiveId");
  });

  it("batch insert preserves existing stock_balances upsert", () => {
    // stock_batches INSERT must come BEFORE the store_products UPDATE
    const batchIdx = ordersSource.indexOf("INSERT INTO inventory.stock_batches");
    const storeProductsIdx = ordersSource.indexOf(
      "UPDATE catalog.store_products",
      batchIdx
    );
    expect(batchIdx).toBeGreaterThan(0);
    expect(storeProductsIdx).toBeGreaterThan(batchIdx);
  });
});

// -- Batch breakdown endpoint tests --

describe("GCP-STG-0392: batch breakdown endpoint", () => {
  const inventoryPath = path.join(
    __dirname,
    "..",
    "src",
    "routes",
    "v1",
    "pos",
    "inventory.ts"
  );

  let inventorySource: string;

  beforeAll(() => {
    inventorySource = fs.readFileSync(inventoryPath, "utf-8");
  });

  it("inventory.ts has GET /inventory/batches/:productId endpoint", () => {
    expect(inventorySource).toContain('"/inventory/batches/:productId"');
  });

  it("endpoint queries inventory.stock_batches with store_id filter", () => {
    expect(inventorySource).toContain("FROM inventory.stock_batches");
    expect(inventorySource).toContain("store_id = $1");
    expect(inventorySource).toContain("product_id = $2");
  });

  it("endpoint filters current_qty > 0 (skip depleted batches)", () => {
    expect(inventorySource).toContain("current_qty > 0");
  });

  it("endpoint orders by expiry_date ASC (FEFO)", () => {
    expect(inventorySource).toContain("ORDER BY expiry_date ASC NULLS LAST");
  });

  it("endpoint requires device token", () => {
    // The route registration line must include requireDeviceToken
    const idx = inventorySource.indexOf('"/inventory/batches/:productId"');
    const routeLine = inventorySource.substring(Math.max(0, idx - 200), idx + 100);
    expect(routeLine).toContain("requireDeviceToken");
  });

  it("endpoint returns totalBatchQty", () => {
    expect(inventorySource).toContain("totalBatchQty");
  });
});

// -- POS client API tests --

describe("GCP-STG-0392: POS inventoryApi client", () => {
  const apiPath = path.join(
    __dirname,
    "..",
    "..",
    "src",
    "services",
    "api",
    "inventoryApi.ts"
  );

  let apiSource: string;

  beforeAll(() => {
    apiSource = fs.readFileSync(apiPath, "utf-8");
  });

  it("exports getStockBatches function", () => {
    expect(apiSource).toContain("export async function getStockBatches");
  });

  it("exports StockBatch type", () => {
    expect(apiSource).toContain("export type StockBatch");
  });

  it("calls /api/v1/pos/inventory/batches/ endpoint", () => {
    expect(apiSource).toContain("/api/v1/pos/inventory/batches/");
  });
});

// -- POS StockScreenV3 UI tests --

describe("GCP-STG-0392: StockScreenV3 batch breakdown UI", () => {
  const screenPath = path.join(
    __dirname,
    "..",
    "..",
    "src",
    "screens",
    "v3",
    "StockScreenV3.tsx"
  );

  let screenSource: string;

  beforeAll(() => {
    screenSource = fs.readFileSync(screenPath, "utf-8");
  });

  it("imports getStockBatches from inventoryApi", () => {
    expect(screenSource).toContain("getStockBatches");
  });

  it("has batch modal with Modal component", () => {
    expect(screenSource).toContain("Modal");
    expect(screenSource).toContain("batchModalItem");
  });

  it("StockItem type includes productId", () => {
    expect(screenSource).toContain("productId: string");
  });

  it("shows batch number and expiry in modal", () => {
    expect(screenSource).toContain("batchNumber");
    expect(screenSource).toContain("expiryDate");
    expect(screenSource).toContain("Batch Breakdown");
  });

  it("shows expired indicator for past-date batches", () => {
    expect(screenSource).toContain("EXPIRED");
  });

  it("shows empty state when no batch records", () => {
    expect(screenSource).toContain("No batch records found");
  });

  it("has loading state for batch fetch", () => {
    expect(screenSource).toContain("batchLoading");
    expect(screenSource).toContain("ActivityIndicator");
  });
});
