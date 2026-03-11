// SCALE-A2: Net content fields unit tests
// Tests for net_content_value (NUMERIC(10,2)) and net_content_unit (VARCHAR(10))

import * as fs from 'fs';
import * as path from 'path';

describe('SCALE-A2: Net content fields', () => {
  // ---------------------------------------------------------------------------
  // 1. Migration SQL is valid
  // ---------------------------------------------------------------------------
  describe('Migration SQL', () => {
    const migrationPath = path.resolve(__dirname, '../migrations/181_scale_a2_net_content_fields.sql');
    let migrationSql: string;

    beforeAll(() => {
      migrationSql = fs.readFileSync(migrationPath, 'utf-8');
    });

    it('migration file exists', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('adds net_content_value column to catalog.products', () => {
      expect(migrationSql).toContain('net_content_value NUMERIC(10,2)');
      expect(migrationSql).toContain('ALTER TABLE catalog.products');
    });

    it('adds net_content_unit column to catalog.products', () => {
      expect(migrationSql).toContain('net_content_unit VARCHAR(10)');
    });

    it('adds net content columns to catalog.supplier_products', () => {
      expect(migrationSql).toContain('ALTER TABLE catalog.supplier_products');
      const supplierSection = migrationSql.split('ALTER TABLE catalog.supplier_products')[1];
      expect(supplierSection).toContain('net_content_value');
      expect(supplierSection).toContain('net_content_unit');
    });

    it('uses IF NOT EXISTS for idempotent migration', () => {
      expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS net_content_value');
      expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS net_content_unit');
    });

    it('columns are nullable (no NOT NULL constraint)', () => {
      const lines = migrationSql.split('\n');
      for (const line of lines) {
        if (line.includes('net_content_value') && line.includes('ADD COLUMN')) {
          expect(line).not.toMatch(/NOT NULL/i);
        }
        if (line.includes('net_content_unit') && line.includes('ADD COLUMN')) {
          expect(line).not.toMatch(/NOT NULL/i);
        }
      }
    });

    it('includes COMMENT ON COLUMN for net_content_value on catalog.products', () => {
      expect(migrationSql).toContain('COMMENT ON COLUMN catalog.products.net_content_value');
    });

    it('includes COMMENT ON COLUMN for net_content_unit on catalog.products', () => {
      expect(migrationSql).toContain('COMMENT ON COLUMN catalog.products.net_content_unit');
    });

    it('includes COMMENT ON COLUMN for supplier_products columns', () => {
      expect(migrationSql).toContain('COMMENT ON COLUMN catalog.supplier_products.net_content_value');
      expect(migrationSql).toContain('COMMENT ON COLUMN catalog.supplier_products.net_content_unit');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Catalog service type definitions
  // ---------------------------------------------------------------------------
  describe('Catalog service type definitions', () => {
    const supportPath = path.resolve(
      __dirname,
      '../services/catalog-service/src/services/catalogServiceSupport.ts'
    );
    let supportFile: string;

    beforeAll(() => {
      supportFile = fs.readFileSync(supportPath, 'utf-8');
    });

    it('CatalogProduct type includes netContentValue', () => {
      expect(supportFile).toContain('netContentValue?: number');
    });

    it('CatalogProduct type includes netContentUnit', () => {
      expect(supportFile).toContain('netContentUnit?: string');
    });

    it('CatalogProductRow type includes net_content_value as string | null (NUMERIC from pg)', () => {
      expect(supportFile).toContain('net_content_value: string | null');
    });

    it('CatalogProductRow type includes net_content_unit as string | null', () => {
      expect(supportFile).toContain('net_content_unit: string | null');
    });

    it('mapCatalogProduct uses parseFloat for net_content_value', () => {
      expect(supportFile).toContain('parseFloat(row.net_content_value');
    });

    it('mapCatalogProduct maps net_content_unit to netContentUnit', () => {
      expect(supportFile).toContain('netContentUnit: row.net_content_unit');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. catalog-service queries.ts ProductRow
  // ---------------------------------------------------------------------------
  describe('catalog-service queries.ts', () => {
    const queriesPath = path.resolve(
      __dirname,
      '../services/catalog-service/src/db/queries.ts'
    );
    let queriesFile: string;

    beforeAll(() => {
      queriesFile = fs.readFileSync(queriesPath, 'utf-8');
    });

    it('ProductRow includes net_content_value', () => {
      expect(queriesFile).toContain('net_content_value');
    });

    it('ProductRow includes net_content_unit', () => {
      expect(queriesFile).toContain('net_content_unit');
    });

    it('mapProductRow maps netContentValue', () => {
      expect(queriesFile).toContain('netContentValue');
    });

    it('mapProductRow maps netContentUnit', () => {
      expect(queriesFile).toContain('netContentUnit');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Catalog service SQL (fetchStoreCatalog + getStoreCatalogProduct)
  // ---------------------------------------------------------------------------
  describe('Catalog service SQL', () => {
    const filePath = path.resolve(
      __dirname,
      '../services/catalog-service/src/services/catalogService.ts'
    );
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('fetchStoreCatalog SELECT includes p.net_content_value', () => {
      expect(fileContent).toContain('p.net_content_value');
    });

    it('fetchStoreCatalog SELECT includes p.net_content_unit', () => {
      expect(fileContent).toContain('p.net_content_unit');
    });

    it('GROUP BY includes net_content_value', () => {
      expect(fileContent).toContain('p.net_content_value,');
    });

    it('GROUP BY includes net_content_unit', () => {
      expect(fileContent).toContain('p.net_content_unit,');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Retailer admin products
  // ---------------------------------------------------------------------------
  describe('Retailer admin products', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/retailer-admin/products.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('GET list SELECT includes net_content_value and net_content_unit', () => {
      expect(fileContent).toContain('net_content_value');
      expect(fileContent).toContain('net_content_unit');
    });

    it('POST create destructures netContentValue and netContentUnit', () => {
      expect(fileContent).toContain('netContentValue');
      expect(fileContent).toContain('netContentUnit');
    });

    it('POST create INSERT includes net_content_value and net_content_unit columns', () => {
      expect(fileContent).toContain('net_content_value,');
      // net_content_unit may be the last column (no trailing comma) or have one
      expect(fileContent).toContain('net_content_unit');
    });

    it('PATCH update SET includes net_content_value and net_content_unit', () => {
      expect(fileContent).toContain('net_content_value = $');
      expect(fileContent).toContain('net_content_unit = $');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Supplier products
  // ---------------------------------------------------------------------------
  describe('Supplier products', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/supplier/products.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('GET list SELECT includes net_content_value and net_content_unit', () => {
      expect(fileContent).toContain('net_content_value,');
      expect(fileContent).toContain('net_content_unit,');
    });

    it('GET list response maps netContentValue using parseFloat', () => {
      expect(fileContent).toContain('netContentValue: p.net_content_value');
      expect(fileContent).toContain('parseFloat(p.net_content_value)');
    });

    it('GET list response maps netContentUnit', () => {
      expect(fileContent).toContain('netContentUnit: p.net_content_unit');
    });

    it('GET detail SELECT includes net_content_value and net_content_unit', () => {
      expect(fileContent).toContain('net_content_value, net_content_unit,');
    });

    it('POST create destructures netContentValue and netContentUnit', () => {
      expect(fileContent).toContain('netContentValue, netContentUnit, // SCALE-A2');
    });

    it('POST create INSERT has net_content_value and net_content_unit columns', () => {
      expect(fileContent).toContain('net_content_value,');
      expect(fileContent).toContain('net_content_unit,');
    });

    it('POST create values array includes parseFloat(netContentValue)', () => {
      expect(fileContent).toContain('parseFloat(netContentValue)');
    });

    it('POST create response includes netContentValue and netContentUnit', () => {
      expect(fileContent).toContain('netContentValue: product.net_content_value');
      expect(fileContent).toContain('netContentUnit: product.net_content_unit');
    });

    it('PATCH destructures netContentValue and netContentUnit', () => {
      expect(fileContent).toContain('netContentValue, netContentUnit, // SCALE-A2');
    });

    it('PATCH dynamic builder updates net_content_value', () => {
      expect(fileContent).toContain('net_content_value = $');
    });

    it('PATCH dynamic builder updates net_content_unit', () => {
      expect(fileContent).toContain('net_content_unit = $');
    });

    it('PATCH RETURNING includes net_content_value and net_content_unit', () => {
      expect(fileContent).toContain('net_content_value,');
      expect(fileContent).toContain('net_content_unit,');
    });

    it('PATCH response includes netContentValue and netContentUnit', () => {
      expect(fileContent).toContain('netContentValue: product.net_content_value');
      expect(fileContent).toContain('netContentUnit: product.net_content_unit');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. POS store products
  // ---------------------------------------------------------------------------
  describe('POS store products', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/pos/storeProducts.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('lookup SELECT includes p.net_content_value', () => {
      expect(fileContent).toContain('p.net_content_value');
    });

    it('lookup SELECT includes p.net_content_unit', () => {
      expect(fileContent).toContain('p.net_content_unit');
    });

    it('lookup response includes netContentValue', () => {
      expect(fileContent).toContain('netContentValue');
    });

    it('lookup response includes netContentUnit', () => {
      expect(fileContent).toContain('netContentUnit');
    });
  });
});
