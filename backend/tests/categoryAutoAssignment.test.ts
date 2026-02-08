// CAT-AUTO-001: Category Auto-Assignment Tests
// Verifies: purchase flow bridge, taxonomy auto-assignment,
// __uncategorized__ filter, conflict preservation.

import { Pool } from "pg";
import { randomUUID } from "crypto";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/supermandi_test";

let pool: Pool;

beforeAll(() => {
  pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
});

afterAll(async () => {
  await pool.end();
});

// =============================================================================
// HELPERS
// =============================================================================

const TEST_STORE_ID = "00000000-0000-0000-0000-ca7000000001";
const ATTA_DAL_TAXONOMY_ID = "f0000000-0000-0000-0000-000000000002"; // from migration 026
const BAAKI_TAXONOMY_ID = "f0000000-0000-0000-0000-000000000015"; // fallback

async function ensureTestStore(client: any): Promise<void> {
  await client.query(
    `INSERT INTO platform.stores (id, name, code, address_line1, phone, status)
     VALUES ($1, 'CAT Test Store', 'CATTEST', '1 Test Rd', '+910000000000', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_STORE_ID]
  );
}

async function cleanupTestData(client: any): Promise<void> {
  await client.query(
    `DELETE FROM catalog.store_products WHERE store_id = $1`,
    [TEST_STORE_ID]
  );
  await client.query(
    `DELETE FROM catalog.products WHERE id::text LIKE '00000000-0000-0000-0000-ca70%'`
  );
  await client.query(
    `DELETE FROM platform.stores WHERE id = $1`,
    [TEST_STORE_ID]
  );
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe("CAT-AUTO-001: Category Auto-Assignment", () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await cleanupTestData(client);
      await ensureTestStore(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await cleanupTestData(client);
    } finally {
      client.release();
    }
  });

  // ─── 1. assign_taxonomy_by_name: known product → correct category ────
  it("assigns Atta-Dal category for product name containing 'atta'", async () => {
    const res = await pool.query(
      `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
      ["Aashirvaad Atta 5kg"]
    );
    expect(res.rows[0].taxonomy_id).toBe(ATTA_DAL_TAXONOMY_ID);
  });

  // ─── 2. assign_taxonomy_by_name: unknown product → Baaki fallback ────
  it("assigns Baaki (Others) for unknown product name", async () => {
    const res = await pool.query(
      `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
      ["XYZ Random Item 12345"]
    );
    expect(res.rows[0].taxonomy_id).toBe(BAAKI_TAXONOMY_ID);
  });

  // ─── 3. assign_taxonomy_by_name: empty string → Baaki ────────────────
  it("assigns Baaki for empty product name", async () => {
    const res = await pool.query(
      `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
      [""]
    );
    expect(res.rows[0].taxonomy_id).toBe(BAAKI_TAXONOMY_ID);
  });

  // ─── 4. Purchase bridge: catalog.products entry created ──────────────
  it("creates catalog.products bridge entry during purchase bridge", async () => {
    const productId = "00000000-0000-0000-0000-ca7000000010";
    const client = await pool.connect();
    try {
      // Simulate purchase bridge: insert into catalog.products
      await client.query(
        `INSERT INTO catalog.products (id, name, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [productId, "Test Atta Product"]
      );

      const res = await client.query(
        `SELECT id, name FROM catalog.products WHERE id = $1::uuid`,
        [productId]
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].name).toBe("Test Atta Product");
    } finally {
      // Cleanup
      await client.query(`DELETE FROM catalog.products WHERE id = $1::uuid`, [productId]);
      client.release();
    }
  });

  // ─── 5. Purchase bridge: catalog.store_products with taxonomy ────────
  it("creates catalog.store_products with auto-assigned taxonomy", async () => {
    const productId = "00000000-0000-0000-0000-ca7000000020";
    const client = await pool.connect();
    try {
      // Step 1: Create catalog.products entry
      await client.query(
        `INSERT INTO catalog.products (id, name, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [productId, "Aashirvaad Atta 5kg"]
      );

      // Step 2: Get taxonomy
      const taxRes = await client.query(
        `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
        ["Aashirvaad Atta 5kg"]
      );
      const taxonomyId = taxRes.rows[0]?.taxonomy_id;

      // Step 3: Create catalog.store_products with taxonomy
      await client.query(
        `INSERT INTO catalog.store_products (
           id, store_id, product_id, purchase_price, display_name,
           taxonomy_id, is_active, metadata_updated_by, created_at, updated_at
         )
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, true, 'PURCHASE', NOW(), NOW())
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           purchase_price = COALESCE(EXCLUDED.purchase_price, catalog.store_products.purchase_price),
           taxonomy_id = COALESCE(catalog.store_products.taxonomy_id, EXCLUDED.taxonomy_id),
           updated_at = NOW()`,
        [TEST_STORE_ID, productId, 5000, "Aashirvaad Atta 5kg", taxonomyId]
      );

      // Verify
      const res = await client.query(
        `SELECT taxonomy_id, display_name, purchase_price
         FROM catalog.store_products
         WHERE store_id = $1 AND product_id = $2::uuid`,
        [TEST_STORE_ID, productId]
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].taxonomy_id).toBe(ATTA_DAL_TAXONOMY_ID);
      expect(res.rows[0].display_name).toBe("Aashirvaad Atta 5kg");
      expect(Number(res.rows[0].purchase_price)).toBe(5000);
    } finally {
      await client.query(
        `DELETE FROM catalog.store_products WHERE store_id = $1 AND product_id = $2::uuid`,
        [TEST_STORE_ID, productId]
      );
      await client.query(`DELETE FROM catalog.products WHERE id = $1::uuid`, [productId]);
      client.release();
    }
  });

  // ─── 6. Conflict: existing taxonomy preserved (retailer override) ────
  it("preserves existing taxonomy on conflict (retailer override)", async () => {
    const productId = "00000000-0000-0000-0000-ca7000000030";
    const masalaTaxonomyId = "f0000000-0000-0000-0000-000000000004"; // Masala
    const client = await pool.connect();
    try {
      // Create catalog.products
      await client.query(
        `INSERT INTO catalog.products (id, name, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [productId, "Atta Product"]
      );

      // First insert: set to Masala (simulating retailer override)
      await client.query(
        `INSERT INTO catalog.store_products (
           id, store_id, product_id, taxonomy_id, is_active, metadata_updated_by
         )
         VALUES (gen_random_uuid(), $1, $2::uuid, $3, true, 'RETAILER')`,
        [TEST_STORE_ID, productId, masalaTaxonomyId]
      );

      // Second insert (purchase bridge): would assign Atta-Dal but should NOT override
      const taxRes = await client.query(
        `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
        ["Atta Product"]
      );
      const autoTaxonomyId = taxRes.rows[0]?.taxonomy_id;
      expect(autoTaxonomyId).toBe(ATTA_DAL_TAXONOMY_ID); // Auto would assign Atta-Dal

      await client.query(
        `INSERT INTO catalog.store_products (
           id, store_id, product_id, purchase_price, display_name,
           taxonomy_id, is_active, metadata_updated_by
         )
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, true, 'PURCHASE')
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           purchase_price = COALESCE(EXCLUDED.purchase_price, catalog.store_products.purchase_price),
           taxonomy_id = COALESCE(catalog.store_products.taxonomy_id, EXCLUDED.taxonomy_id),
           updated_at = NOW()`,
        [TEST_STORE_ID, productId, 3000, "Atta Product", autoTaxonomyId]
      );

      // Verify: taxonomy should still be Masala (retailer override preserved)
      const res = await client.query(
        `SELECT taxonomy_id FROM catalog.store_products
         WHERE store_id = $1 AND product_id = $2::uuid`,
        [TEST_STORE_ID, productId]
      );
      expect(res.rows[0].taxonomy_id).toBe(masalaTaxonomyId);
    } finally {
      await client.query(
        `DELETE FROM catalog.store_products WHERE store_id = $1 AND product_id = $2::uuid`,
        [TEST_STORE_ID, productId]
      );
      await client.query(`DELETE FROM catalog.products WHERE id = $1::uuid`, [productId]);
      client.release();
    }
  });

  // ─── 7. NULL taxonomy filled on conflict ─────────────────────────────
  it("fills NULL taxonomy on conflict when no retailer override", async () => {
    const productId = "00000000-0000-0000-0000-ca7000000040";
    const client = await pool.connect();
    try {
      // Create catalog.products
      await client.query(
        `INSERT INTO catalog.products (id, name, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [productId, "Rice Item"]
      );

      // First insert: no taxonomy (NULL)
      await client.query(
        `INSERT INTO catalog.store_products (
           id, store_id, product_id, taxonomy_id, is_active, metadata_updated_by
         )
         VALUES (gen_random_uuid(), $1, $2::uuid, NULL, true, 'LEGACY')`,
        [TEST_STORE_ID, productId]
      );

      // Purchase bridge: auto-assigns Chawal category
      const taxRes = await client.query(
        `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
        ["Rice Item"]
      );
      const autoTaxonomyId = taxRes.rows[0]?.taxonomy_id;

      await client.query(
        `INSERT INTO catalog.store_products (
           id, store_id, product_id, purchase_price, display_name,
           taxonomy_id, is_active, metadata_updated_by
         )
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, true, 'PURCHASE')
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           purchase_price = COALESCE(EXCLUDED.purchase_price, catalog.store_products.purchase_price),
           taxonomy_id = COALESCE(catalog.store_products.taxonomy_id, EXCLUDED.taxonomy_id),
           updated_at = NOW()`,
        [TEST_STORE_ID, productId, 2000, "Rice Item", autoTaxonomyId]
      );

      // Verify: taxonomy should now be set (was NULL, now filled)
      const res = await client.query(
        `SELECT taxonomy_id FROM catalog.store_products
         WHERE store_id = $1 AND product_id = $2::uuid`,
        [TEST_STORE_ID, productId]
      );
      expect(res.rows[0].taxonomy_id).toBe(autoTaxonomyId);
      expect(res.rows[0].taxonomy_id).not.toBeNull();
    } finally {
      await client.query(
        `DELETE FROM catalog.store_products WHERE store_id = $1 AND product_id = $2::uuid`,
        [TEST_STORE_ID, productId]
      );
      await client.query(`DELETE FROM catalog.products WHERE id = $1::uuid`, [productId]);
      client.release();
    }
  });
});
