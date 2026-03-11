// SCALE-A1: Product compliance fields unit tests
// Tests for manufacturer_name, country_of_origin, shelf_life_days

import * as fs from 'fs';
import * as path from 'path';

describe('SCALE-A1: Product compliance fields', () => {
  // ---------------------------------------------------------------------------
  // 1. Migration SQL is valid (parse test)
  // ---------------------------------------------------------------------------
  describe('Migration SQL', () => {
    const migrationPath = path.resolve(__dirname, '../migrations/180_scale_a1_product_compliance_fields.sql');
    let migrationSql: string;

    beforeAll(() => {
      migrationSql = fs.readFileSync(migrationPath, 'utf-8');
    });

    it('migration file exists', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('adds manufacturer_name column to catalog.products', () => {
      expect(migrationSql).toContain('manufacturer_name VARCHAR(200)');
      expect(migrationSql).toContain('ALTER TABLE catalog.products');
    });

    it('adds country_of_origin column to catalog.products', () => {
      expect(migrationSql).toContain('country_of_origin VARCHAR(100)');
    });

    it('adds shelf_life_days column to catalog.products', () => {
      expect(migrationSql).toContain('shelf_life_days INTEGER');
    });

    it('adds compliance columns to catalog.supplier_products', () => {
      expect(migrationSql).toContain('ALTER TABLE catalog.supplier_products');
      // Verify all three columns are added to supplier_products
      const supplierSection = migrationSql.split('ALTER TABLE catalog.supplier_products')[1];
      expect(supplierSection).toContain('manufacturer_name');
      expect(supplierSection).toContain('country_of_origin');
      expect(supplierSection).toContain('shelf_life_days');
    });

    it('uses IF NOT EXISTS for idempotent migration', () => {
      expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS manufacturer_name');
      expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS country_of_origin');
      expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS shelf_life_days');
    });

    it('creates manufacturer index with IF NOT EXISTS', () => {
      expect(migrationSql).toContain('CREATE INDEX IF NOT EXISTS idx_products_manufacturer');
    });

    it('creates partial index (WHERE manufacturer_name IS NOT NULL)', () => {
      expect(migrationSql).toContain('WHERE manufacturer_name IS NOT NULL');
    });

    it('includes COMMENT ON COLUMN for all new columns', () => {
      expect(migrationSql).toContain("COMMENT ON COLUMN catalog.products.manufacturer_name");
      expect(migrationSql).toContain("COMMENT ON COLUMN catalog.products.country_of_origin");
      expect(migrationSql).toContain("COMMENT ON COLUMN catalog.products.shelf_life_days");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Fields are nullable (no breaking change for existing products)
  // ---------------------------------------------------------------------------
  describe('Fields are nullable', () => {
    it('migration does not add NOT NULL constraint to manufacturer_name', () => {
      const migrationSql = fs.readFileSync(
        path.resolve(__dirname, '../migrations/180_scale_a1_product_compliance_fields.sql'),
        'utf-8'
      );
      // Ensure no NOT NULL constraint on the new columns
      // The columns should be nullable (no NOT NULL after the type definition)
      const lines = migrationSql.split('\n');
      for (const line of lines) {
        if (line.includes('manufacturer_name') && line.includes('ADD COLUMN')) {
          expect(line).not.toMatch(/NOT NULL/i);
        }
        if (line.includes('country_of_origin') && line.includes('ADD COLUMN')) {
          expect(line).not.toMatch(/NOT NULL/i);
        }
        if (line.includes('shelf_life_days') && line.includes('ADD COLUMN')) {
          expect(line).not.toMatch(/NOT NULL/i);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Catalog service types include new fields
  // ---------------------------------------------------------------------------
  describe('Catalog service type definitions', () => {
    it('CatalogProduct type includes compliance fields', () => {
      const supportFile = fs.readFileSync(
        path.resolve(__dirname, '../services/catalog-service/src/services/catalogServiceSupport.ts'),
        'utf-8'
      );
      expect(supportFile).toContain('manufacturerName?: string');
      expect(supportFile).toContain('countryOfOrigin?: string');
      expect(supportFile).toContain('shelfLifeDays?: number');
    });

    it('CatalogProductRow type includes snake_case columns', () => {
      const supportFile = fs.readFileSync(
        path.resolve(__dirname, '../services/catalog-service/src/services/catalogServiceSupport.ts'),
        'utf-8'
      );
      expect(supportFile).toContain('manufacturer_name: string | null');
      expect(supportFile).toContain('country_of_origin: string | null');
      expect(supportFile).toContain('shelf_life_days: number | null');
    });

    it('ProductRow in queries.ts includes compliance fields', () => {
      const queriesFile = fs.readFileSync(
        path.resolve(__dirname, '../services/catalog-service/src/db/queries.ts'),
        'utf-8'
      );
      expect(queriesFile).toContain('manufacturer_name: string | null');
      expect(queriesFile).toContain('country_of_origin: string | null');
      expect(queriesFile).toContain('shelf_life_days: number | null');
    });

    it('mapProductRow maps compliance fields to camelCase', () => {
      const queriesFile = fs.readFileSync(
        path.resolve(__dirname, '../services/catalog-service/src/db/queries.ts'),
        'utf-8'
      );
      expect(queriesFile).toContain('manufacturerName: row.manufacturer_name');
      expect(queriesFile).toContain('countryOfOrigin: row.country_of_origin');
      expect(queriesFile).toContain('shelfLifeDays: row.shelf_life_days');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Retailer admin products include compliance fields
  // ---------------------------------------------------------------------------
  describe('Retailer admin products', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/retailer-admin/products.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('POST create includes compliance fields in INSERT', () => {
      expect(fileContent).toContain('manufacturer_name, country_of_origin, shelf_life_days');
    });

    it('PATCH update includes compliance fields in UPDATE', () => {
      expect(fileContent).toContain('manufacturer_name = $');
      expect(fileContent).toContain('country_of_origin = $');
      expect(fileContent).toContain('shelf_life_days = $');
    });

    it('GET list includes compliance fields in SELECT', () => {
      expect(fileContent).toContain('"manufacturerName"');
      expect(fileContent).toContain('"countryOfOrigin"');
      expect(fileContent).toContain('"shelfLifeDays"');
    });

    it('destructures compliance fields from req.body', () => {
      expect(fileContent).toContain('manufacturerName, countryOfOrigin, shelfLifeDays');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Supplier products include compliance fields
  // ---------------------------------------------------------------------------
  describe('Supplier products', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/supplier/products.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('POST create includes compliance fields in INSERT', () => {
      expect(fileContent).toContain('manufacturer_name,');
      expect(fileContent).toContain('country_of_origin,');
      expect(fileContent).toContain('shelf_life_days,');
    });

    it('POST create returns compliance fields in response', () => {
      expect(fileContent).toContain('manufacturerName: product.manufacturer_name');
      expect(fileContent).toContain('countryOfOrigin: product.country_of_origin');
      expect(fileContent).toContain('shelfLifeDays: product.shelf_life_days');
    });

    it('PATCH update accepts compliance fields', () => {
      // Check dynamic update builder includes compliance fields
      expect(fileContent).toContain('manufacturer_name = $');
      expect(fileContent).toContain('country_of_origin = $');
      expect(fileContent).toContain('shelf_life_days = $');
    });

    it('GET list includes compliance fields', () => {
      expect(fileContent).toContain('manufacturer_name,');
      expect(fileContent).toContain('country_of_origin,');
      expect(fileContent).toContain('shelf_life_days,');
    });

    it('GET detail includes compliance fields', () => {
      expect(fileContent).toContain('manufacturerName: p.manufacturer_name');
      expect(fileContent).toContain('countryOfOrigin: p.country_of_origin');
      expect(fileContent).toContain('shelfLifeDays: p.shelf_life_days');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. POS store products include compliance fields in detail
  // ---------------------------------------------------------------------------
  describe('POS store products', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/pos/storeProducts.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('lookup endpoint SELECT includes compliance fields from products table', () => {
      expect(fileContent).toContain('p.manufacturer_name');
      expect(fileContent).toContain('p.country_of_origin');
      expect(fileContent).toContain('p.shelf_life_days');
    });

    it('lookup response includes compliance fields', () => {
      expect(fileContent).toContain('manufacturerName: row.manufacturer_name');
      expect(fileContent).toContain('countryOfOrigin: row.country_of_origin');
      expect(fileContent).toContain('shelfLifeDays: row.shelf_life_days');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Catalog service SQL includes compliance fields
  // ---------------------------------------------------------------------------
  describe('Catalog service SQL', () => {
    const filePath = path.resolve(__dirname, '../services/catalog-service/src/services/catalogService.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('fetchStoreCatalog SELECT includes compliance fields', () => {
      expect(fileContent).toContain('p.manufacturer_name');
      expect(fileContent).toContain('p.country_of_origin');
      expect(fileContent).toContain('p.shelf_life_days');
    });

    it('GROUP BY includes compliance fields', () => {
      expect(fileContent).toContain('p.manufacturer_name, p.country_of_origin, p.shelf_life_days');
    });
  });
});
