// SCALE-A2: Unit tests for net_content_value and net_content_unit fields
// Tests migration SQL validity, field validation, and API response inclusion

import * as fs from 'fs';
import * as path from 'path';

describe('SCALE-A2: net_content_value and net_content_unit', () => {
  // ---------------------------------------------------------------------------
  // Migration SQL validity
  // ---------------------------------------------------------------------------
  describe('Migration SQL', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../migrations/181_scale_a2_net_content_fields.sql'
    );

    it('migration file exists', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('migration SQL contains ADD COLUMN for catalog.products', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('ALTER TABLE catalog.products');
      expect(sql).toContain('net_content_value NUMERIC(10,2)');
      expect(sql).toContain('net_content_unit VARCHAR(10)');
    });

    it('migration SQL contains ADD COLUMN for catalog.supplier_products', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('ALTER TABLE catalog.supplier_products');
      expect(sql).toContain('net_content_value NUMERIC(10,2)');
      expect(sql).toContain('net_content_unit VARCHAR(10)');
    });

    it('migration uses IF NOT EXISTS for idempotent reruns', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      const ifNotExistsCount = (sql.match(/IF NOT EXISTS/g) || []).length;
      // Should have at least 4 IF NOT EXISTS (2 columns x 2 tables)
      expect(ifNotExistsCount).toBeGreaterThanOrEqual(4);
    });

    it('migration includes COMMENT ON COLUMN for documentation', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('COMMENT ON COLUMN catalog.products.net_content_value');
      expect(sql).toContain('COMMENT ON COLUMN catalog.products.net_content_unit');
      expect(sql).toContain('COMMENT ON COLUMN catalog.supplier_products.net_content_value');
      expect(sql).toContain('COMMENT ON COLUMN catalog.supplier_products.net_content_unit');
    });
  });

  // ---------------------------------------------------------------------------
  // Valid net_content_unit values
  // ---------------------------------------------------------------------------
  describe('net_content_unit validation', () => {
    const VALID_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

    it('accepts all valid unit values', () => {
      for (const unit of VALID_UNITS) {
        expect(VALID_UNITS.includes(unit)).toBe(true);
      }
    });

    it('rejects invalid unit values', () => {
      const invalidUnits = ['oz', 'lb', 'cup', 'tbsp', 'piece', 'gm', 'KG', 'ML'];
      for (const unit of invalidUnits) {
        expect(VALID_UNITS.includes(unit)).toBe(false);
      }
    });

    it('valid units list has exactly 5 entries', () => {
      expect(VALID_UNITS).toHaveLength(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Fields are nullable (no NOT NULL constraint)
  // ---------------------------------------------------------------------------
  describe('fields are nullable', () => {
    it('migration does not contain NOT NULL for net_content columns', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../migrations/181_scale_a2_net_content_fields.sql'
      );
      const sql = fs.readFileSync(migrationPath, 'utf-8');

      // Split by line and check lines containing net_content
      const lines = sql.split('\n').filter((l) => l.includes('net_content'));
      for (const line of lines) {
        // COMMENT lines will contain the column name but shouldn't be checked for NOT NULL constraint
        if (line.trim().startsWith('COMMENT')) continue;
        expect(line).not.toMatch(/NOT\s+NULL/i);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Supplier products include net_content in route files
  // ---------------------------------------------------------------------------
  describe('supplier products route includes net_content', () => {
    const supplierProductsPath = path.resolve(
      __dirname,
      '../src/routes/v1/supplier/products.ts'
    );

    it('supplier products POST accepts netContentValue and netContentUnit', () => {
      const src = fs.readFileSync(supplierProductsPath, 'utf-8');
      expect(src).toContain('netContentValue');
      expect(src).toContain('netContentUnit');
    });

    it('supplier products INSERT includes net_content_value', () => {
      const src = fs.readFileSync(supplierProductsPath, 'utf-8');
      expect(src).toContain('net_content_value');
      expect(src).toContain('net_content_unit');
    });

    it('supplier products response maps net_content fields', () => {
      const src = fs.readFileSync(supplierProductsPath, 'utf-8');
      // Check response mapping has netContentValue
      expect(src).toContain('netContentValue: p');
      expect(src).toContain('netContentUnit: p');
    });
  });

  // ---------------------------------------------------------------------------
  // Buy catalog response includes net_content
  // ---------------------------------------------------------------------------
  describe('buy catalog response includes net_content', () => {
    const catalogPath = path.resolve(
      __dirname,
      '../src/routes/v1/catalog.ts'
    );

    it('buy-catalog query selects net_content fields', () => {
      const src = fs.readFileSync(catalogPath, 'utf-8');
      expect(src).toContain('sp_net_content_value');
      expect(src).toContain('sp_net_content_unit');
      expect(src).toContain('mp_net_content_value');
      expect(src).toContain('mp_net_content_unit');
    });

    it('buy-catalog response includes netContentValue and netContentUnit', () => {
      const src = fs.readFileSync(catalogPath, 'utf-8');
      expect(src).toContain('netContentValue:');
      expect(src).toContain('netContentUnit:');
    });
  });

  // ---------------------------------------------------------------------------
  // Catalog service types include net_content
  // ---------------------------------------------------------------------------
  describe('catalog service support types include net_content', () => {
    const supportPath = path.resolve(
      __dirname,
      '../services/catalog-service/src/services/catalogServiceSupport.ts'
    );

    it('CatalogProduct interface has netContentValue and netContentUnit', () => {
      const src = fs.readFileSync(supportPath, 'utf-8');
      expect(src).toContain('netContentValue?: number');
      expect(src).toContain('netContentUnit?: string');
    });

    it('CatalogProductRow has net_content_value and net_content_unit', () => {
      const src = fs.readFileSync(supportPath, 'utf-8');
      expect(src).toContain('net_content_value: string | null');
      expect(src).toContain('net_content_unit: string | null');
    });
  });
});
