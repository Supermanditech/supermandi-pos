/**
 * GCP-STG-0325: Verify source column is set correctly in all store_products INSERT paths.
 *
 * This test reads the source files and asserts that every INSERT INTO catalog.store_products
 * includes the `source` column with the correct value for each code path.
 */
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_SRC = path.resolve(__dirname, '..', 'src');

/** Extract all INSERT INTO catalog.store_products statements from a file and return source values */
function extractSourceValues(filePath: string): { line: number; source: string | null }[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const results: { line: number; source: string | null }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/INSERT\s+INTO\s+catalog\.store_products\s*\(/i.test(line)) {
      // Gather the full INSERT statement (up to RETURNING or next ;)
      let stmt = '';
      for (let j = i; j < Math.min(i + 20, lines.length); j++) {
        stmt += lines[j] + '\n';
        if (/RETURNING|ON CONFLICT/i.test(lines[j]) && j > i) break;
      }

      // Check if `source` column is in the column list
      const colMatch = stmt.match(/INSERT\s+INTO\s+catalog\.store_products\s*\(([^)]+)\)/is);
      if (!colMatch) continue;

      const columns = colMatch[1];
      if (/\bsource\b/.test(columns)) {
        // Extract the source literal value from VALUES clause
        const sourceVal = stmt.match(/'(manual|csv_import|grn_inward|supplier_publish)'/);
        results.push({ line: i + 1, source: sourceVal ? sourceVal[1] : null });
      } else {
        results.push({ line: i + 1, source: null });
      }
    }
  }
  return results;
}

describe('GCP-STG-0325: store_products source column', () => {
  test('csvImport.ts sets source=csv_import on both INSERT paths', () => {
    const file = path.join(BACKEND_SRC, 'routes/v1/retailer-admin/csvImport.ts');
    const results = extractSourceValues(file);
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.source).toBe('csv_import');
    }
  });

  test('products.ts sets source=manual on all INSERT paths', () => {
    const file = path.join(BACKEND_SRC, 'routes/v1/retailer-admin/products.ts');
    const results = extractSourceValues(file);
    expect(results.length).toBeGreaterThanOrEqual(3);
    for (const r of results) {
      expect(r.source).toBe('manual');
    }
  });

  test('admin/suppliers.ts sets source=supplier_publish on both INSERT paths', () => {
    const file = path.join(BACKEND_SRC, 'routes/v1/admin/suppliers.ts');
    const results = extractSourceValues(file);
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.source).toBe('supplier_publish');
    }
  });

  test('retailer-admin/suppliers.ts sets source=supplier_publish', () => {
    const file = path.join(BACKEND_SRC, 'routes/v1/retailer-admin/suppliers.ts');
    const results = extractSourceValues(file);
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.source).toBe('supplier_publish');
    }
  });

  test('purchaseService.ts sets source=grn_inward', () => {
    const file = path.join(BACKEND_SRC, 'services/purchaseService.ts');
    const results = extractSourceValues(file);
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.source).toBe('grn_inward');
    }
  });

  test('storeProductDigitisationService.ts sets source=manual', () => {
    const file = path.join(BACKEND_SRC, 'services/storeProductDigitisationService.ts');
    const results = extractSourceValues(file);
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.source).toBe('manual');
    }
  });

  test('migration 221 adds source column with correct CHECK constraint', () => {
    const migrationFile = path.resolve(__dirname, '..', 'migrations', '221_gcp_stg_0325_store_products_source.sql');
    const content = fs.readFileSync(migrationFile, 'utf8');
    expect(content).toContain('ADD COLUMN IF NOT EXISTS source');
    expect(content).toContain("DEFAULT 'manual'");
    expect(content).toContain("'manual'");
    expect(content).toContain("'csv_import'");
    expect(content).toContain("'grn_inward'");
    expect(content).toContain("'supplier_publish'");
    expect(content).toContain('ROLLBACK');
  });
});
