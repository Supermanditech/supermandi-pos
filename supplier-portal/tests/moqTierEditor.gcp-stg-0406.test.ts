/**
 * GCP-STG-0406: Structured MOQ Tier Editor
 *
 * Verifies that the supplier product form uses a structured tier editor
 * instead of raw JSON input for moqTiers. Checks:
 *   1. No raw JSON text input for moqTiers
 *   2. Structured editor with data-testid="moq-tier-editor" exists
 *   3. Add Tier button exists (data-testid="moq-tier-add")
 *   4. Tier row inputs use data-testid="moq-tier-minQty-{n}" / "moq-tier-discountPct-{n}"
 *   5. Remove button exists per row (data-testid="moq-tier-remove-{n}")
 *   6. Validation helpers exist: minQty > 0, discountPct 0-100, no duplicate minQty
 *   7. Serialize/parse round-trip functions exist
 *   8. moqTiersArray state is declared
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

describe('GCP-STG-0406 — Structured MOQ Tier Editor', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(FORM_FILE, 'utf-8');
  });

  it('should NOT have raw JSON text input for moqTiers', () => {
    // Old pattern: <input type="text" ... name="moqTiers"
    expect(source).not.toMatch(/name="moqTiers"/);
    // Old label text mentioning JSON
    expect(source).not.toContain('MOQ Tier Discounts (JSON)');
  });

  it('should have a structured tier editor container', () => {
    expect(source).toContain('data-testid="moq-tier-editor"');
  });

  it('should have an Add Tier button', () => {
    expect(source).toContain('data-testid="moq-tier-add"');
    expect(source).toContain('handleAddMoqTier');
  });

  it('should have tier row inputs with indexed test IDs', () => {
    expect(source).toContain('data-testid={`moq-tier-minQty-${idx}`}');
    expect(source).toContain('data-testid={`moq-tier-discountPct-${idx}`}');
  });

  it('should have a Remove button per tier row', () => {
    expect(source).toContain('data-testid={`moq-tier-remove-${idx}`}');
    expect(source).toContain('handleRemoveMoqTier');
  });

  it('should have moqTiersArray state', () => {
    expect(source).toContain('moqTiersArray');
    expect(source).toContain('setMoqTiersArray');
  });

  it('should have parseMoqTiers function for edit pre-fill', () => {
    expect(source).toContain('parseMoqTiers');
    // Should be called during handleEdit
    expect(source).toMatch(/setMoqTiersArray\(parseMoqTiers\(/);
  });

  it('should have serializeMoqTiers for form submit', () => {
    expect(source).toContain('serializeMoqTiers');
    expect(source).toMatch(/moqTiers:\s*serializeMoqTiers\(moqTiersArray\)/);
  });

  it('should have validateMoqTiers with minQty > 0, discountPct 0-100, no duplicates', () => {
    expect(source).toContain('validateMoqTiers');
    // Validates minQty > 0
    expect(source).toContain('Min Qty must be greater than 0');
    // Validates discountPct range
    expect(source).toMatch(/Discount must be 0.100%/);
    // Validates no duplicate minQty
    expect(source).toContain('Duplicate Min Qty values are not allowed');
  });

  it('should reset moqTiersArray on form reset', () => {
    // resetForm should clear the tiers array
    expect(source).toContain('setMoqTiersArray([]); // GCP-STG-0406');
  });

  it('should validate MOQ tiers before submit', () => {
    // handleSubmit should call validateMoqTiers before proceeding
    expect(source).toMatch(/validateMoqTiers\(moqTiersArray\)/);
  });
});
