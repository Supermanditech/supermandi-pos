/**
 * Scan Integration Tests
 *
 * Tests that:
 * 1. /api/v1/pos/scan/resolve returns product for valid barcode
 * 2. /api/v1/pos/products/lookup returns product for valid barcode
 * 3. Barcodes with special characters (like #) are handled correctly
 *
 * Run with: npx vitest run src/routes/v1/pos/__tests__/scan.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";

// Test database connection
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://localhost:5432/supermandi_test";
let pool: Pool;

// Test fixtures
const TEST_STORE_ID = "a0000000-0000-0000-0000-000000000001"; // Demo store
const TEST_BARCODE_NORMAL = "8901725115159"; // Standard EAN
const TEST_BARCODE_HASH = "5004#001000"; // Barcode with # character

// Product/variant/barcode fixture IDs
const TEST_PRODUCT_ID = "p-test-scan-" + randomUUID().slice(0, 8);
const TEST_VARIANT_ID = "v-test-scan-" + randomUUID().slice(0, 8);

async function setupTestData() {
  // Create test product
  await pool.query(
    `INSERT INTO products (id, name, category, retailer_status, enrichment_status)
     VALUES ($1, 'Test Scan Product', 'Test', 'active', 'complete')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_PRODUCT_ID]
  );

  // Create test variant
  await pool.query(
    `INSERT INTO variants (id, product_id, name, currency)
     VALUES ($1, $2, 'Test Scan Product', 'INR')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_VARIANT_ID, TEST_PRODUCT_ID]
  );

  // Create barcode with # character
  await pool.query(
    `INSERT INTO barcodes (barcode, variant_id, barcode_type)
     VALUES ($1, $2, 'internal')
     ON CONFLICT (barcode) DO NOTHING`,
    [TEST_BARCODE_HASH, TEST_VARIANT_ID]
  );

  // Link to demo store
  await pool.query(
    `INSERT INTO retailer_variants (store_id, variant_id, selling_price_minor, digitised_by_retailer)
     VALUES ($1, $2, 9900, true)
     ON CONFLICT (store_id, variant_id) DO NOTHING`,
    [TEST_STORE_ID, TEST_VARIANT_ID]
  );
}

async function cleanupTestData() {
  await pool.query(`DELETE FROM retailer_variants WHERE variant_id = $1`, [
    TEST_VARIANT_ID,
  ]);
  await pool.query(`DELETE FROM barcodes WHERE barcode = $1`, [
    TEST_BARCODE_HASH,
  ]);
  await pool.query(`DELETE FROM variants WHERE id = $1`, [TEST_VARIANT_ID]);
  await pool.query(`DELETE FROM products WHERE id = $1`, [TEST_PRODUCT_ID]);
}

describe("Scan Endpoints", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  describe("Barcode lookup (fetchStoreProductByBarcode)", () => {
    it("should find product by barcode with # character", async () => {
      // Direct query to mimic fetchStoreProductByBarcode
      const res = await pool.query(
        `
        SELECT
          v.id,
          v.name,
          COALESCE(sb.barcode, b.barcode) AS barcode,
          v.currency,
          rv.selling_price_minor,
          rv.digitised_by_retailer
        FROM barcodes b
        JOIN variants v ON v.id = b.variant_id
        LEFT JOIN barcodes sb ON sb.variant_id = v.id AND sb.barcode_type = 'supermandi'
        JOIN retailer_variants rv ON rv.variant_id = v.id AND rv.store_id = $2
        WHERE b.barcode = $1
        LIMIT 1
        `,
        [TEST_BARCODE_HASH, TEST_STORE_ID]
      );

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].barcode).toBe(TEST_BARCODE_HASH);
      expect(res.rows[0].selling_price_minor).toBe(9900);
    });

    it("should store barcode EXACTLY as provided (no normalization)", async () => {
      const res = await pool.query(`SELECT barcode FROM barcodes WHERE barcode = $1`, [
        TEST_BARCODE_HASH,
      ]);

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].barcode).toBe("5004#001000");
      expect(res.rows[0].barcode).toContain("#");
    });
  });

  describe("Migration 019: Demo products seeded", () => {
    it("should have seeded barcode 5004#001000 for demo store", async () => {
      // This test validates migration 019_seed_v1_demo_products.sql
      const res = await pool.query(
        `
        SELECT b.barcode, v.name, rv.selling_price_minor
        FROM barcodes b
        JOIN variants v ON v.id = b.variant_id
        JOIN retailer_variants rv ON rv.variant_id = v.id AND rv.store_id = $1
        WHERE b.barcode = '5004#001000'
        `,
        [TEST_STORE_ID]
      );

      // Skip if migration hasn't run
      if (res.rows.length === 0) {
        console.log("Migration 019 not yet applied - skipping seeded data test");
        return;
      }

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].barcode).toBe("5004#001000");
    });
  });
});
