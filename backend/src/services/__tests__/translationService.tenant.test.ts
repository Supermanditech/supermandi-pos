/**
 * TR-PEND-002: Tenant Isolation Tests for Translation Service
 *
 * Critical tests to ensure Store A's translation overrides
 * are NEVER visible to Store B.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import {
  saveTranslationOverride,
  getLocalizedProduct,
  getLocalizedProducts,
} from "../translationService";

// Test database connection
const TEST_DB_URL = process.env.TEST_DATABASE_URL || "postgresql://localhost:5432/supermandi_test";
let pool: Pool;

// Test fixtures
const STORE_A_ID = "11111111-1111-1111-1111-111111111111";
const STORE_B_ID = "22222222-2222-2222-2222-222222222222";
const TEST_PRODUCT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const TEST_PRODUCT = {
  id: TEST_PRODUCT_ID,
  name: "Test Product English",
  brand: "Test Brand",
};

describe("TR-PEND-002: Translation Service Tenant Isolation", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });

    // Setup test product (if not exists)
    await pool.query(`
      INSERT INTO catalog.products (id, name, brand, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (id) DO NOTHING
    `, [TEST_PRODUCT_ID, TEST_PRODUCT.name, TEST_PRODUCT.brand]);
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query(`
      DELETE FROM catalog.translation_overrides
      WHERE store_id IN ($1, $2)
    `, [STORE_A_ID, STORE_B_ID]);

    await pool.query(`
      DELETE FROM catalog.products WHERE id = $1
    `, [TEST_PRODUCT_ID]);

    await pool.end();
  });

  beforeEach(async () => {
    // Clear overrides before each test
    await pool.query(`
      DELETE FROM catalog.translation_overrides
      WHERE store_id IN ($1, $2)
    `, [STORE_A_ID, STORE_B_ID]);
  });

  describe("Store Override Isolation", () => {
    it("Store A override should NOT appear in Store B getLocalizedProduct", async () => {
      // Store A sets a Hindi override
      await saveTranslationOverride(
        pool,
        STORE_A_ID,
        TEST_PRODUCT_ID,
        "hi",
        "स्टोर A का नाम",
        null
      );

      // Store B queries the same product
      const storeBResult = await getLocalizedProduct(
        pool,
        TEST_PRODUCT,
        "hi",
        STORE_B_ID
      );

      // Store B should NOT see Store A's override
      expect(storeBResult.displayName).not.toBe("स्टोर A का नाम");
      expect(storeBResult.translationSource).not.toBe("override");
    });

    it("Store A override should appear for Store A only", async () => {
      await saveTranslationOverride(
        pool,
        STORE_A_ID,
        TEST_PRODUCT_ID,
        "hi",
        "स्टोर A का नाम",
        null
      );

      const storeAResult = await getLocalizedProduct(
        pool,
        TEST_PRODUCT,
        "hi",
        STORE_A_ID
      );

      expect(storeAResult.displayName).toBe("स्टोर A का नाम");
      expect(storeAResult.translationSource).toBe("override");
    });

    it("Both stores can have different overrides for same product", async () => {
      // Store A sets override
      await saveTranslationOverride(
        pool,
        STORE_A_ID,
        TEST_PRODUCT_ID,
        "hi",
        "स्टोर A का नाम",
        null
      );

      // Store B sets different override
      await saveTranslationOverride(
        pool,
        STORE_B_ID,
        TEST_PRODUCT_ID,
        "hi",
        "स्टोर B का नाम",
        null
      );

      // Query both stores
      const storeAResult = await getLocalizedProduct(
        pool,
        TEST_PRODUCT,
        "hi",
        STORE_A_ID
      );
      const storeBResult = await getLocalizedProduct(
        pool,
        TEST_PRODUCT,
        "hi",
        STORE_B_ID
      );

      // Each store sees only their own override
      expect(storeAResult.displayName).toBe("स्टोर A का नाम");
      expect(storeBResult.displayName).toBe("स्टोर B का नाम");
    });
  });

  describe("Batch Localization Isolation", () => {
    it("getLocalizedProducts should isolate batch overrides by store", async () => {
      // Store A sets override
      await saveTranslationOverride(
        pool,
        STORE_A_ID,
        TEST_PRODUCT_ID,
        "hi",
        "स्टोर A बैच नाम",
        null
      );

      // Store B batch query should NOT see Store A's override
      const storeBResults = await getLocalizedProducts(
        pool,
        [TEST_PRODUCT],
        "hi",
        STORE_B_ID
      );

      expect(storeBResults).toHaveLength(1);
      expect(storeBResults[0].displayName).not.toBe("स्टोर A बैच नाम");
      expect(storeBResults[0].translationSource).not.toBe("override");
    });

    it("Batch query should return correct overrides for requesting store", async () => {
      await saveTranslationOverride(
        pool,
        STORE_A_ID,
        TEST_PRODUCT_ID,
        "hi",
        "स्टोर A बैच नाम",
        null
      );

      const storeAResults = await getLocalizedProducts(
        pool,
        [TEST_PRODUCT],
        "hi",
        STORE_A_ID
      );

      expect(storeAResults).toHaveLength(1);
      expect(storeAResults[0].displayName).toBe("स्टोर A बैच नाम");
      expect(storeAResults[0].translationSource).toBe("override");
    });
  });

  describe("No StoreId - Global Fallback", () => {
    it("When no storeId provided, should fall back to global translation", async () => {
      // Store A has override
      await saveTranslationOverride(
        pool,
        STORE_A_ID,
        TEST_PRODUCT_ID,
        "hi",
        "स्टोर A का नाम",
        null
      );

      // Query without storeId (anonymous/global context)
      const result = await getLocalizedProduct(
        pool,
        TEST_PRODUCT,
        "hi"
        // no storeId
      );

      // Should NOT see any store's override
      expect(result.displayName).not.toBe("स्टोर A का नाम");
      expect(result.translationSource).not.toBe("override");
    });
  });

  describe("Database Constraint Enforcement", () => {
    it("UNIQUE constraint prevents duplicate store+product+locale overrides", async () => {
      // First insert
      await saveTranslationOverride(
        pool,
        STORE_A_ID,
        TEST_PRODUCT_ID,
        "hi",
        "नाम 1",
        null
      );

      // Second insert should update, not create duplicate
      await saveTranslationOverride(
        pool,
        STORE_A_ID,
        TEST_PRODUCT_ID,
        "hi",
        "नाम 2",
        null
      );

      // Verify only one row exists
      const countResult = await pool.query(`
        SELECT COUNT(*) as count FROM catalog.translation_overrides
        WHERE store_id = $1 AND product_id = $2 AND locale = $3
      `, [STORE_A_ID, TEST_PRODUCT_ID, "hi"]);

      expect(parseInt(countResult.rows[0].count)).toBe(1);

      // Verify it has the latest value
      const valueResult = await pool.query(`
        SELECT name_override FROM catalog.translation_overrides
        WHERE store_id = $1 AND product_id = $2 AND locale = $3
      `, [STORE_A_ID, TEST_PRODUCT_ID, "hi"]);

      expect(valueResult.rows[0].name_override).toBe("नाम 2");
    });
  });
});
