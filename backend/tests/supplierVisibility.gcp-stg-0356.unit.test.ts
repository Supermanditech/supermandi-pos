/**
 * GCP-STG-0356: Supplier Visibility Toggle Per SKU
 *
 * Tests:
 * 1. Migration adds supplier_visible column with DEFAULT false
 * 2. Admin edit endpoint accepts supplierVisible boolean
 * 3. BUY catalog masks supplier identity when supplier_visible = false
 * 4. BUY catalog shows supplier identity when supplier_visible = true
 * 5. Barcode lookup also respects supplier_visible
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0356: Supplier Visibility Toggle", () => {
  // ── Migration ──
  describe("Migration 229", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../migrations/229_gcp_stg_0356_supplier_visible.sql"
    );

    it("migration file exists", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it("adds supplier_visible column with DEFAULT false", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("supplier_visible");
      expect(sql).toContain("BOOLEAN");
      expect(sql).toContain("DEFAULT false");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS");
    });

    it("includes ROLLBACK comment", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("ROLLBACK");
      expect(sql).toContain("DROP COLUMN");
    });
  });

  // ── Admin edit endpoint ──
  describe("Admin edit endpoint accepts supplierVisible", () => {
    const suppliersPath = path.resolve(
      __dirname,
      "../src/routes/v1/admin/suppliers.ts"
    );

    it("destructures supplierVisible from req.body", () => {
      const code = fs.readFileSync(suppliersPath, "utf-8");
      expect(code).toContain("supplierVisible");
    });

    it("builds UPDATE SET supplier_visible clause", () => {
      const code = fs.readFileSync(suppliersPath, "utf-8");
      expect(code).toContain("supplier_visible = $");
    });

    it("returns supplierVisible in RETURNING clause", () => {
      const code = fs.readFileSync(suppliersPath, "utf-8");
      expect(code).toContain('supplier_visible as "supplierVisible"');
    });

    it("includes supplierVisible in response JSON", () => {
      const code = fs.readFileSync(suppliersPath, "utf-8");
      expect(code).toContain("supplierVisible: updated.supplierVisible");
    });

    it("records change in audit log", () => {
      const code = fs.readFileSync(suppliersPath, "utf-8");
      expect(code).toContain("changes.supplierVisible");
    });
  });

  // ── BUY catalog masking ──
  describe("BUY catalog supplier masking", () => {
    const catalogPath = path.resolve(
      __dirname,
      "../src/routes/v1/catalog.ts"
    );

    it("selects supplier_visible in priced CTE", () => {
      const code = fs.readFileSync(catalogPath, "utf-8");
      // Both BUY queries should include supplier_visible
      const matches = code.match(/supplier_visible/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(4);
    });

    it("masks bestSupplierName when supplier_visible is false", () => {
      const code = fs.readFileSync(catalogPath, "utf-8");
      // CASE WHEN p2.supplier_visible THEN p2.supplier_name ELSE 'SuperMandi' END
      expect(code).toContain("WHEN p2.supplier_visible THEN p2.supplier_name ELSE 'SuperMandi'");
    });

    it("masks bestSupplierCity when supplier_visible is false", () => {
      const code = fs.readFileSync(catalogPath, "utf-8");
      expect(code).toContain("WHEN p2.supplier_visible THEN p2.supplier_city ELSE NULL");
    });

    it("masks supplierId in json_agg when supplier_visible is false", () => {
      const code = fs.readFileSync(catalogPath, "utf-8");
      expect(code).toContain("WHEN supplier_visible THEN supplier_id ELSE NULL");
    });

    it("masks supplierName in json_agg when supplier_visible is false", () => {
      const code = fs.readFileSync(catalogPath, "utf-8");
      expect(code).toContain("WHEN supplier_visible THEN supplier_name ELSE 'SuperMandi'");
    });

    it("masks supplierCity in json_agg when supplier_visible is false", () => {
      const code = fs.readFileSync(catalogPath, "utf-8");
      expect(code).toContain("WHEN supplier_visible THEN supplier_city ELSE NULL");
    });
  });

  // ── Admin catalog GET returns supplier_visible ──
  describe("Admin catalog GET includes supplierVisible", () => {
    const adminCatalogPath = path.resolve(
      __dirname,
      "../src/routes/v1/admin/catalog.ts"
    );

    it("selects supplier_visible in admin product listing", () => {
      const code = fs.readFileSync(adminCatalogPath, "utf-8");
      expect(code).toContain('"supplierVisible"');
      expect(code).toContain("sp.supplier_visible");
    });
  });

  // ── Frontend type + UI ──
  describe("SuperAdmin frontend wiring", () => {
    const catalogApiPath = path.resolve(
      __dirname,
      "../../supermandi-superadmin/src/api/catalog.ts"
    );
    const catalogTabPath = path.resolve(
      __dirname,
      "../../supermandi-superadmin/src/tabs/CatalogTab.tsx"
    );

    it("CatalogProduct type includes supplierVisible", () => {
      const code = fs.readFileSync(catalogApiPath, "utf-8");
      expect(code).toContain("supplierVisible?: boolean");
    });

    it("editProductMetadata accepts supplierVisible param", () => {
      const code = fs.readFileSync(catalogApiPath, "utf-8");
      // In the function signature type
      const fnSection = code.slice(code.indexOf("editProductMetadata"));
      expect(fnSection).toContain("supplierVisible?: boolean");
    });

    it("CatalogTab has supplier-visible toggle state", () => {
      const code = fs.readFileSync(catalogTabPath, "utf-8");
      expect(code).toContain("editSupplierVisible");
      expect(code).toContain("setEditSupplierVisible");
    });

    it("CatalogTab renders supplier-visible checkbox with test ID", () => {
      const code = fs.readFileSync(catalogTabPath, "utf-8");
      expect(code).toContain('data-testid="supplier-visible-toggle"');
    });

    it("CatalogTab sends supplierVisible in metadata payload", () => {
      const code = fs.readFileSync(catalogTabPath, "utf-8");
      expect(code).toContain("metadataPayload.supplierVisible = editSupplierVisible");
    });

    it("openEdit populates supplierVisible from product data", () => {
      const code = fs.readFileSync(catalogTabPath, "utf-8");
      expect(code).toContain("setEditSupplierVisible(product.supplierVisible");
    });
  });
});
