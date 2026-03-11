// SCALE-A3: Batch number on store_products unit tests
// Tests for batch_number column, index, and API wiring

import * as fs from 'fs';
import * as path from 'path';

describe('SCALE-A3: batch_number on store_products', () => {
  // ---------------------------------------------------------------------------
  // 1. Migration SQL validity
  // ---------------------------------------------------------------------------
  describe('Migration SQL', () => {
    const migrationPath = path.resolve(__dirname, '../migrations/182_scale_a3_batch_number_store_products.sql');
    let migrationSql: string;

    beforeAll(() => {
      migrationSql = fs.readFileSync(migrationPath, 'utf-8');
    });

    it('migration file exists', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('adds batch_number column with IF NOT EXISTS (idempotent)', () => {
      expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100)');
    });

    it('targets the correct table: catalog.store_products', () => {
      expect(migrationSql).toContain('ALTER TABLE catalog.store_products');
    });

    it('creates batch index with IF NOT EXISTS (idempotent)', () => {
      expect(migrationSql).toContain('CREATE INDEX IF NOT EXISTS idx_store_products_batch');
    });

    it('batch index is on (store_id, batch_number)', () => {
      expect(migrationSql).toContain('ON catalog.store_products(store_id, batch_number)');
    });

    it('batch index is a partial index (WHERE batch_number IS NOT NULL)', () => {
      expect(migrationSql).toContain('WHERE batch_number IS NOT NULL');
    });

    it('batch_number column is nullable (no NOT NULL constraint)', () => {
      const lines = migrationSql.split('\n');
      for (const line of lines) {
        if (line.includes('batch_number') && line.includes('ADD COLUMN')) {
          expect(line).not.toMatch(/NOT NULL/i);
        }
      }
    });

    it('includes COMMENT ON COLUMN for batch_number', () => {
      expect(migrationSql).toContain("COMMENT ON COLUMN catalog.store_products.batch_number");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. POS storeProducts lookup includes batch_number
  // ---------------------------------------------------------------------------
  describe('POS storeProducts lookup', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/pos/storeProducts.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('SELECT includes sp.batch_number', () => {
      expect(fileContent).toContain('sp.batch_number');
    });

    it('lookup response includes batchNumber field', () => {
      expect(fileContent).toContain('batchNumber: row.batch_number');
    });

    it('conflict canonical response includes batchNumber field', () => {
      expect(fileContent).toContain('batchNumber: canonical.batch_number');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Retailer admin inventory list includes batch_number
  // ---------------------------------------------------------------------------
  describe('Retailer admin inventory list', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/retailer-admin/inventory.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('inventory SELECT includes sp.batch_number', () => {
      expect(fileContent).toContain('sp.batch_number as "batchNumber"');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Stock-in accepts and persists batch_number
  // ---------------------------------------------------------------------------
  describe('Stock-in batch_number persistence', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/pos/stockIn.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('destructures batchNumber from item in stock-in loop', () => {
      expect(fileContent).toContain('batchNumber');
    });

    it('UPDATE store_products includes batch_number = $4 when provided', () => {
      expect(fileContent).toContain('batch_number = $4');
    });

    it('batch_number update is conditional (only when batchNumber is provided)', () => {
      // Verify the conditional logic exists — both branches of the if/else
      expect(fileContent).toContain('batchNumber && typeof batchNumber === "string"');
    });
  });
});
