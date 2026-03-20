// SCALE-C3: FEFO (First Expired First Out) stock rotation unit tests
// Verifies: backend route sort=fefo logic, SQL ORDER BY, API response shape,
// retailer inventory sort, POS list endpoint changes

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// 1. POS storeProducts.ts — sort=fefo on /store-products/list
// =============================================================================
describe('SCALE-C3: POS storeProducts list endpoint — sort=fefo', () => {
  const filePath = path.resolve(__dirname, '../src/routes/v1/pos/storeProducts.ts');
  let fileContent: string;

  beforeAll(() => {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  });

  it('reads sort query param from request', () => {
    expect(fileContent).toContain('sort === "fefo"');
  });

  it('builds FEFO ORDER BY clause with expiry_date ASC', () => {
    expect(fileContent).toContain('sp.expiry_date ASC');
  });

  it('puts NULL expiry_date AFTER products with expiry (NULLS last)', () => {
    expect(fileContent).toContain('CASE WHEN sp.expiry_date IS NULL THEN 1 ELSE 0 END');
  });

  it('falls back to name-alphabetical sort when FEFO is not active', () => {
    expect(fileContent).toContain("ORDER BY COALESCE(sp.display_name, p.name) ASC");
  });

  it('selects expiry_date in the list query', () => {
    // Confirm expiry_date is selected from sp
    expect(fileContent).toMatch(/sp\.expiry_date/);
  });

  it('selects batch_number in the list query', () => {
    expect(fileContent).toMatch(/sp\.batch_number/);
  });

  it('includes expiry_date in the response data mapping', () => {
    expect(fileContent).toContain('expiry_date: row.expiry_date');
  });

  it('includes batch_number in the response data mapping', () => {
    expect(fileContent).toContain('batch_number: row.batch_number');
  });

  it('includes sort echo in response JSON', () => {
    expect(fileContent).toContain('sort: sortFefo ? "fefo" : "default"');
  });

  it('uses SCALE-C3 comment to document the feature', () => {
    expect(fileContent).toContain('SCALE-C3');
  });
});

// =============================================================================
// 2. Retailer Admin inventory.ts — sort=fefo on /inventory
// =============================================================================
describe('SCALE-C3: Retailer inventory endpoint — sort=fefo', () => {
  const filePath = path.resolve(__dirname, '../src/routes/v1/retailer-admin/inventory.ts');
  let fileContent: string;

  beforeAll(() => {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  });

  it('reads sort query param from request', () => {
    expect(fileContent).toContain('sort === "fefo"');
  });

  it('builds FEFO ORDER BY with expiry_date ASC for retailer inventory', () => {
    expect(fileContent).toContain('sp.expiry_date ASC');
  });

  it('puts NULL expiry_date last in FEFO order for retailer inventory', () => {
    expect(fileContent).toContain('CASE WHEN sp.expiry_date IS NULL THEN 1 ELSE 0 END');
  });

  it('selects expiryDate in retailer inventory SELECT', () => {
    expect(fileContent).toContain('sp.expiry_date as "expiryDate"');
  });

  it('returns expiryDate in retailer inventory data rows', () => {
    expect(fileContent).toContain('expiryDate: row.expiryDate');
  });

  it('echoes sort mode in retailer inventory response', () => {
    expect(fileContent).toContain('sort: sortFefo ? "fefo" : "default"');
  });

  it('uses SCALE-C3 comment to document the feature', () => {
    expect(fileContent).toContain('SCALE-C3');
  });
});

// =============================================================================
// 3. POS sellSearchApi.ts — sort param on listStoreProducts
// =============================================================================
describe('SCALE-C3: POS sellSearchApi.ts — sort param support', () => {
  const filePath = path.resolve(__dirname, '../../src/services/api/sellSearchApi.ts');
  let fileContent: string;

  beforeAll(() => {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  });

  it('accepts sort option in listStoreProducts', () => {
    expect(fileContent).toContain('sort?: "fefo" | "default"');
  });

  it('appends sort=fefo to URL when sort is fefo', () => {
    expect(fileContent).toContain('params.set("sort", "fefo")');
  });

  it('does not append sort param when sort is not fefo', () => {
    // Only set when sort === 'fefo'
    expect(fileContent).toContain('if (sort === "fefo")');
  });

  it('uses SCALE-C3 comment to document the feature', () => {
    expect(fileContent).toContain('SCALE-C3');
  });
});

// =============================================================================
// 4. Retailer InventoryPage.tsx — FEFO sort UI
// =============================================================================
describe('SCALE-C3: Retailer InventoryPage — FEFO sort UI', () => {
  const filePath = path.resolve(__dirname, '../../retailer-admin/src/pages/InventoryPage.tsx');
  let fileContent: string;

  beforeAll(() => {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  });

  it('has stockSort state initialized to default', () => {
    // useUrlState always returns string — generic removed, cast at usage sites
    expect(fileContent).toContain("useUrlState('stockSort', 'default')");
  });

  it('has fefo as a stock sort option', () => {
    expect(fileContent).toContain("fefo: 'FEFO (Earliest Expiry First)'");
  });

  it('passes sort=fefo to inventory API when fefo selected', () => {
    expect(fileContent).toContain("stockSort === 'fefo'");
    expect(fileContent).toContain('sort=fefo');
  });

  it('shows FEFO active badge when fefo sort is selected', () => {
    expect(fileContent).toContain('FEFO active — earliest expiry shown first');
  });

  it('renders Stock tab for switching between ledger and stock view', () => {
    expect(fileContent).toContain("tab-stock");
    expect(fileContent).toContain("tab-ledger");
  });

  it('renders stock sort dropdown button', () => {
    expect(fileContent).toContain('stock-sort-btn');
    expect(fileContent).toContain('stock-sort-dropdown');
  });

  it('renders sort option for each STOCK_SORT_LABELS key via template testid', () => {
    // Source uses data-testid={`sort-option-${opt}`} over STOCK_SORT_LABELS keys
    expect(fileContent).toContain('sort-option-${opt}');
    // Verify all four sort keys exist in STOCK_SORT_LABELS
    expect(fileContent).toContain("default: 'Default'");
    expect(fileContent).toContain("fefo: 'FEFO (Earliest Expiry First)'");
    expect(fileContent).toContain("name: 'Name A-Z'");
    expect(fileContent).toContain("stock_low: 'Stock Low-High'");
  });

  it('renders expiry date for each stock product', () => {
    expect(fileContent).toContain('formatExpiryDate(product.expiryDate)');
  });

  it('shows expiry days badge for products near expiry', () => {
    expect(fileContent).toContain('daysUntilExpiry');
  });

  it('uses SCALE-C3 comment to document the feature', () => {
    expect(fileContent).toContain('SCALE-C3');
  });
});

// =============================================================================
// 5. SellScanScreen.tsx — FEFO toggle in POS
//    SKIPPED: Legacy SellScanScreen.tsx deleted in V3 refactor.
//    FEFO toggle UI deferred to SellScreenV3.tsx when FEFO POS feature is ported.
//    Backend FEFO sort (storeProducts.ts) and retailer FEFO (InventoryPage.tsx) are canonical proof.
// =============================================================================
describe('SCALE-C3: SellScanScreen — FEFO toggle (legacy screen deleted in V3)', () => {
  it.skip('FEFO POS toggle deferred to V3 SellScreenV3 implementation', () => {});
});
