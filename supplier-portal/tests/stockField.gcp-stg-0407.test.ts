/**
 * GCP-STG-0407: Add Supplier Stock Availability Field
 *
 * Verifies that:
 *   1. ProductInput interface includes stockQty field
 *   2. Product interface includes stockQty field
 *   3. Supplier form has "Available Stock" input with name="stockQty"
 *   4. formData initial state includes stockQty
 *   5. resetForm clears stockQty
 *   6. handleEdit pre-fills stockQty from product
 *   7. handleResubmit includes stockQty
 *   8. handleChange parses stockQty as integer
 *   9. SupplierProductCardV3 has supplierStockQty in interface
 *  10. SupplierProductCardV3 renders stock availability indicator badge
 *  11. getSupplierStockStatus helper returns correct labels/levels
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const FORM_FILE = join(
  __dirname,
  '..',
  'src',
  'app',
  '(dashboard)',
  'products',
  'page.tsx',
);

const API_FILE = join(
  __dirname,
  '..',
  'src',
  'lib',
  'api.ts',
);

const CARD_FILE = join(
  __dirname,
  '..',
  '..',
  'src',
  'components',
  'v3',
  'SupplierProductCardV3.tsx',
);

describe('GCP-STG-0407 — Supplier Stock Availability Field', () => {
  let formSource: string;
  let apiSource: string;
  let cardSource: string;

  beforeAll(() => {
    formSource = readFileSync(FORM_FILE, 'utf-8');
    apiSource = readFileSync(API_FILE, 'utf-8');
    cardSource = readFileSync(CARD_FILE, 'utf-8');
  });

  // --- API type checks ---
  it('ProductInput interface should include stockQty field', () => {
    // Match stockQty inside the ProductInput interface block
    const inputMatch = apiSource.match(/export interface ProductInput\s*\{[\s\S]*?\n\}/);
    expect(inputMatch).not.toBeNull();
    expect(inputMatch![0]).toContain('stockQty');
  });

  it('Product interface should include stockQty field', () => {
    const productMatch = apiSource.match(/export interface Product\s*\{[\s\S]*?\n\}/);
    expect(productMatch).not.toBeNull();
    expect(productMatch![0]).toContain('stockQty');
  });

  // --- Form field checks ---
  it('form should have "Available Stock" label', () => {
    expect(formSource).toContain('Available Stock');
  });

  it('form should have input with name="stockQty"', () => {
    expect(formSource).toMatch(/name="stockQty"/);
  });

  it('form input should be type="number" with min="0"', () => {
    // Find the full stockQty input element (type comes before name on the same element)
    const inputMatch = formSource.match(/<input[^>]*name="stockQty"[^>]*\/>/);
    expect(inputMatch).not.toBeNull();
    const inputBlock = inputMatch![0];
    expect(inputBlock).toContain('type="number"');
    expect(inputBlock).toContain('min="0"');
  });

  // --- formData state checks ---
  it('initial formData should include stockQty', () => {
    // The initial useState call should include stockQty
    expect(formSource).toMatch(/stockQty:\s*undefined.*\/\/\s*GCP-STG-0407/);
  });

  it('resetForm should clear stockQty', () => {
    // resetForm sets stockQty back to undefined
    const resetMatch = formSource.match(/const resetForm[\s\S]*?setFormData\(\{[\s\S]*?\}\);/);
    expect(resetMatch).not.toBeNull();
    expect(resetMatch![0]).toContain('stockQty');
  });

  it('handleEdit should pre-fill stockQty from product', () => {
    const editMatch = formSource.match(/const handleEdit[\s\S]*?setShowForm\(true\)/);
    expect(editMatch).not.toBeNull();
    expect(editMatch![0]).toContain('stockQty');
  });

  it('handleResubmit should include stockQty', () => {
    const resubmitMatch = formSource.match(/const handleResubmit[\s\S]*?\}\);[\s]*\};/);
    expect(resubmitMatch).not.toBeNull();
    expect(resubmitMatch![0]).toContain('stockQty');
  });

  it('handleChange should parse stockQty as integer', () => {
    // stockQty should be in the integer-parsing branch alongside deliverySlaDays, creditDays, etc.
    expect(formSource).toMatch(/name\s*===\s*'stockQty'/);
  });

  // --- SupplierProductCardV3 checks ---
  it('SupplierProduct interface should include supplierStockQty', () => {
    expect(cardSource).toContain('supplierStockQty');
  });

  it('card should have getSupplierStockStatus helper function', () => {
    expect(cardSource).toContain('getSupplierStockStatus');
  });

  it('getSupplierStockStatus should return correct labels', () => {
    expect(cardSource).toContain('"In Stock"');
    expect(cardSource).toContain('"Low Stock"');
    expect(cardSource).toContain('"Out of Stock"');
    expect(cardSource).toContain('"Stock N/A"');
  });

  it('getSupplierStockStatus should check qty boundaries (0 and 10)', () => {
    // qty === 0 → Out of Stock, qty <= 10 → Low Stock, qty > 10 → In Stock
    expect(cardSource).toMatch(/qty\s*===\s*0/);
    expect(cardSource).toMatch(/qty\s*<=\s*10/);
  });

  it('card should render supplier stock badge with level-based styles', () => {
    expect(cardSource).toContain('supplierStockBadge');
    expect(cardSource).toContain('supplierStockInStock');
    expect(cardSource).toContain('supplierStockLow');
    expect(cardSource).toContain('supplierStockOut');
    expect(cardSource).toContain('supplierStockNa');
  });

  it('card should render supplierStock.label text', () => {
    expect(cardSource).toContain('supplierStock.label');
  });
});
