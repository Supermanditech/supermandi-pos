/**
 * GCP-STG-0298: Verify no duplicate procurement field IDs in the supplier product form.
 *
 * The product form in supplier-portal had duplicate HTML elements for:
 *   - procurementUnit (id="product-procurementUnit")
 *   - procurementPackQty (id="product-procurementPackQty")
 *   - baseStockUnit (id="product-baseStockUnit")
 *
 * The canonical set lives in the "Procurement Packaging" section (~line 818).
 * The duplicate set that was in "Commercial Terms" has been removed.
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

describe('GCP-STG-0298 — no duplicate procurement fields', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(FORM_FILE, 'utf-8');
  });

  const fieldIds = [
    'product-procurementUnit',
    'product-procurementPackQty',
    'product-baseStockUnit',
  ];

  for (const fieldId of fieldIds) {
    it(`id="${fieldId}" appears exactly once as a form element`, () => {
      // Match id="<fieldId>" used as an HTML/JSX attribute on form elements
      const regex = new RegExp(`id="${fieldId}"`, 'g');
      const matches = source.match(regex);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);
    });
  }

  const fieldNames = [
    'procurementUnit',
    'procurementPackQty',
    'baseStockUnit',
  ];

  for (const fieldName of fieldNames) {
    it(`name="${fieldName}" appears exactly once as a form input name`, () => {
      // Match name="<fieldName>" — this is the form binding attribute
      const regex = new RegExp(`name="${fieldName}"`, 'g');
      const matches = source.match(regex);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);
    });
  }

  it('contains no "Package Type (sets procurement unit)" label (removed duplicate)', () => {
    expect(source).not.toContain('Package Type (sets procurement unit)');
  });

  it('contains the canonical "Procurement Packaging" section', () => {
    expect(source).toContain('Procurement Packaging');
  });
});
