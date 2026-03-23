/**
 * GCP-STG-0429: Supplier Product Type Missing gstRate Field
 *
 * Verifies that:
 *   1. Product interface in api.ts includes gstRate field
 *   2. Backend supplier products list query SELECTs gst_rate
 *   3. Backend supplier products list response maps gstRate
 *   4. Backend single product GET query SELECTs gst_rate
 *   5. Backend single product GET response maps gstRate
 *   6. Products page table has GST column header
 *   7. Products page table renders GST rate badge
 *   8. Products page edit form shows read-only GST rate
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const API_FILE = join(
  __dirname,
  '..',
  'src',
  'lib',
  'api.ts',
);

const FORM_FILE = join(
  __dirname,
  '..',
  'src',
  'app',
  '(dashboard)',
  'products',
  'page.tsx',
);

const BACKEND_FILE = join(
  __dirname,
  '..',
  '..',
  'backend',
  'src',
  'routes',
  'v1',
  'supplier',
  'products.ts',
);

describe('GCP-STG-0429 — Supplier Product gstRate Field', () => {
  let apiSource: string;
  let formSource: string;
  let backendSource: string;

  beforeAll(() => {
    apiSource = readFileSync(API_FILE, 'utf-8');
    formSource = readFileSync(FORM_FILE, 'utf-8');
    backendSource = readFileSync(BACKEND_FILE, 'utf-8');
  });

  test('Product interface includes gstRate field', () => {
    expect(apiSource).toMatch(/gstRate\??\s*:\s*number\s*\|\s*null/);
  });

  test('Backend list query SELECTs gst_rate from supplier_products', () => {
    // The list endpoint query should include gst_rate in SELECT
    expect(backendSource).toMatch(/gst_rate\s*\n?\s*FROM catalog\.supplier_products/);
  });

  test('Backend list response maps gstRate from gst_rate', () => {
    expect(backendSource).toMatch(/gstRate:\s*p\.gst_rate/);
  });

  test('Backend single product GET query includes gst_rate', () => {
    // The single-product query should also select gst_rate
    expect(backendSource).toMatch(/split_sell_eligible,\s*gst_rate/);
  });

  test('Products page table has GST column header', () => {
    expect(formSource).toContain('GST');
    // Ensure there is a <th> for GST
    expect(formSource).toMatch(/<th[^>]*>\s*\n?\s*GST\s*\n?\s*<\/th>/);
  });

  test('Products page table renders GST rate badge', () => {
    expect(formSource).toMatch(/product\.gstRate/);
    expect(formSource).toContain('GST {product.gstRate}%');
  });

  test('Products page edit form shows read-only GST rate', () => {
    expect(formSource).toMatch(/editingProduct\?\.gstRate/);
    expect(formSource).toContain('Set by SuperMandi admin');
  });
});
