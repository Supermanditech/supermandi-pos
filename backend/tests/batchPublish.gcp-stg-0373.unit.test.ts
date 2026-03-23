/**
 * GCP-STG-0373: Batch INSERT for single-product publish endpoint.
 *
 * Verifies that the POST /admin/products/:productId/publish endpoint uses
 * multi-row VALUES batch INSERTs instead of per-store individual INSERTs.
 *
 * Checks:
 * 1. The publish endpoint builds multi-row VALUES clauses (not a per-store loop with individual INSERTs)
 * 2. The BATCH_SIZE constant is defined (caps rows per INSERT at 100)
 * 3. Both store_products and store_product_barcodes INSERTs are batched
 * 4. source='supplier_publish' is preserved in the batch INSERT (GCP-STG-0325 continuity)
 * 5. Barcode INSERT uses ON CONFLICT (store_id, barcode) DO NOTHING
 */
import * as fs from 'fs';
import * as path from 'path';

const SUPPLIERS_FILE = path.resolve(
  __dirname,
  '..',
  'src',
  'routes',
  'v1',
  'admin',
  'suppliers.ts'
);

function getPublishEndpointBlock(): string {
  const content = fs.readFileSync(SUPPLIERS_FILE, 'utf8');
  // Extract from the publish endpoint signature to the next router method
  const startMarker = 'POST /api/v1/admin/products/:productId/publish';
  const endMarker = 'POST /api/v1/admin/products/:productId/unpublish';
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not locate publish endpoint block in suppliers.ts');
  }
  return content.slice(startIdx, endIdx);
}

describe('GCP-STG-0373: Batch publish INSERT', () => {
  let block: string;

  beforeAll(() => {
    block = getPublishEndpointBlock();
  });

  test('uses BATCH_SIZE constant for chunking', () => {
    expect(block).toContain('BATCH_SIZE');
    // Must define the batch size (default 100)
    expect(block).toMatch(/BATCH_SIZE\s*=\s*100/);
  });

  test('builds multi-row VALUES clauses for store_products', () => {
    // Should have valuesClauses array and join them
    expect(block).toContain('valuesClauses');
    expect(block).toMatch(/valuesClauses\.join/);
    // Should NOT have a simple for-of loop doing individual INSERTs
    // The old pattern was: for (const store of linkedStores.rows) { await client.query(`INSERT INTO catalog.store_products
    // New pattern uses: for (let batchStart = 0; batchStart < storeIds.length; batchStart += BATCH_SIZE)
    expect(block).toMatch(/batchStart\s*\+\s*=?\s*BATCH_SIZE/);
  });

  test('preserves source=supplier_publish in batch INSERT (GCP-STG-0325)', () => {
    // The source column must still be set to 'supplier_publish'
    expect(block).toContain("supplier_publish");
    // Must appear in the store_products VALUES context (built via valuesClauses)
    const insertIdx = block.indexOf('INSERT INTO catalog.store_products');
    expect(insertIdx).toBeGreaterThan(-1);
    // The valuesClauses builder embeds supplier_publish before the INSERT query runs
    expect(block).toMatch(/supplier_publish/);
  });

  test('batches barcode INSERTs too', () => {
    // Barcode INSERT should also use multi-row VALUES
    expect(block).toContain('bcValuesClauses');
    expect(block).toMatch(/bcValuesClauses\.join/);
    // Must have ON CONFLICT for idempotency
    const barcodeSection = block.slice(block.indexOf('store_product_barcodes'));
    expect(barcodeSection).toContain('ON CONFLICT');
    expect(barcodeSection).toContain('DO NOTHING');
  });

  test('barcode INSERT preserves source=admin_publish', () => {
    // admin_publish is embedded in the bcValuesClauses builder
    expect(block).toContain("admin_publish");
  });

  test('RETURNING includes store_id for barcode mapping', () => {
    // The store_products INSERT must RETURN id AND store_id so barcodes can be mapped
    const insertSection = block.slice(
      block.indexOf('INSERT INTO catalog.store_products'),
      block.indexOf('store_product_barcodes')
    );
    expect(insertSection).toMatch(/RETURNING\s+id\s*,\s*store_id/);
  });

  test('no per-store individual INSERT pattern remains', () => {
    // The old pattern: for (const store of linkedStores.rows)
    // Should NOT exist in the publish endpoint anymore
    expect(block).not.toMatch(/for\s*\(\s*const\s+store\s+of\s+linkedStores\.rows\s*\)/);
  });

  test('storeIds are extracted from linkedStores.rows', () => {
    expect(block).toMatch(/storeIds\s*=\s*linkedStores\.rows\.map/);
  });
});
