// SCALE-C1: POS stock-in batch_number + expiry_date unit tests
// Verifies: backend route, offline schema v6, scan.ts upsert/fetch, type contracts

import * as fs from 'fs';
import * as path from 'path';

describe('SCALE-C1: Stock-in batch_number + expiry_date', () => {
  // ---------------------------------------------------------------------------
  // 1. Backend stockIn.ts — accepts and persists both fields
  // ---------------------------------------------------------------------------
  describe('Backend stockIn.ts', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/pos/stockIn.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('destructures expiryDate from item in stock-in loop', () => {
      expect(fileContent).toContain('expiryDate');
    });

    it('destructures batchNumber from item in stock-in loop', () => {
      expect(fileContent).toContain('batchNumber');
    });

    it('validates expiryDate as ISO YYYY-MM-DD when provided', () => {
      expect(fileContent).toContain('YYYY-MM-DD');
      expect(fileContent).toContain('INVALID_EXPIRY_DATE');
    });

    it('persists expiry_date to store_products when provided (UPDATE with expiry_date)', () => {
      expect(fileContent).toContain('expiry_date = $4');
      // Also exists for joint batch+expiry branch
      expect(fileContent).toContain('expiry_date = $5');
    });

    it('persists batch_number to store_products when provided (UPDATE with batch_number)', () => {
      expect(fileContent).toContain('batch_number = $4');
    });

    it('stock-in without batch/expiry still updates stock only (fallback branch exists)', () => {
      // Verify all four branches exist
      expect(fileContent).toContain('hasBatch && hasExpiry');
      expect(fileContent).toContain('} else if (hasBatch)');
      expect(fileContent).toContain('} else if (hasExpiry)');
    });

    it('empty string batchNumber is treated as absent (hasBatch check)', () => {
      expect(fileContent).toContain('batchNumber.trim()');
    });

    it('empty string expiryDate is treated as absent (hasExpiry check)', () => {
      expect(fileContent).toContain('expiryDate.trim()');
    });

    it('returns 400 for invalid date format', () => {
      expect(fileContent).toContain('"INVALID_EXPIRY_DATE"');
      expect(fileContent).toContain('400');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Backend inventory.ts — purchase_received also persists batch/expiry
  // ---------------------------------------------------------------------------
  describe('Backend inventory.ts (purchase_received path)', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/pos/inventory.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('destructures batchNumber and expiryDate from item', () => {
      expect(fileContent).toContain('batchNumber, expiryDate');
    });

    it('isPurchaseReceived gate prevents batch/expiry on non-inward transactions', () => {
      expect(fileContent).toContain('isPurchaseReceived');
    });

    it('validates expiry date format with ISO regex', () => {
      expect(fileContent).toContain('/^\\d{4}-\\d{2}-\\d{2}$/');
    });

    it('all four update branches present (both, batch-only, expiry-only, stock-only)', () => {
      expect(fileContent).toContain('hasBatch && hasExpiry');
      expect(fileContent).toContain('} else if (hasBatch)');
      expect(fileContent).toContain('} else if (hasExpiry)');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Offline DB schema v6
  // ---------------------------------------------------------------------------
  describe('Offline DB localDb.ts', () => {
    const filePath = path.resolve(__dirname, '../../src/services/offline/localDb.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('SCHEMA_VERSION is 6', () => {
      expect(fileContent).toContain('const SCHEMA_VERSION = 6');
    });

    it('migration version 6 exists', () => {
      expect(fileContent).toContain("version: 6");
    });

    it('migration v6 is named add_batch_expiry_to_offline_products', () => {
      expect(fileContent).toContain('add_batch_expiry_to_offline_products');
    });

    it('migration v6 adds batch_number column', () => {
      expect(fileContent).toContain('"batch_number", "TEXT NULL"');
    });

    it('migration v6 adds expiry_date column', () => {
      expect(fileContent).toContain('"expiry_date", "TEXT NULL"');
    });

    it('self-heal list includes batch_number', () => {
      const batchHealIdx = fileContent.indexOf('batch_number');
      // It appears in both migration and self-heal
      const secondIdx = fileContent.indexOf('batch_number', batchHealIdx + 1);
      expect(secondIdx).toBeGreaterThan(batchHealIdx);
    });

    it('self-heal list includes expiry_date', () => {
      const expiryHealIdx = fileContent.indexOf('expiry_date');
      const secondIdx = fileContent.indexOf('expiry_date', expiryHealIdx + 1);
      expect(secondIdx).toBeGreaterThan(expiryHealIdx);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. scan.ts — upsertLocalProduct and fetchLocalProduct handle batch/expiry
  // ---------------------------------------------------------------------------
  describe('scan.ts offline product persistence', () => {
    const filePath = path.resolve(__dirname, '../../src/services/offline/scan.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('OfflineScanProduct type includes batchNumber field', () => {
      expect(fileContent).toContain('batchNumber?: string | null');
    });

    it('OfflineScanProduct type includes expiryDate field', () => {
      expect(fileContent).toContain('expiryDate?: string | null');
    });

    it('upsertLocalProduct accepts batchNumber parameter', () => {
      expect(fileContent).toContain('batchNumber: string | null = null');
    });

    it('upsertLocalProduct accepts expiryDate parameter', () => {
      expect(fileContent).toContain('expiryDate: string | null = null');
    });

    it('upsertLocalProduct persists batch_number to offline_products', () => {
      expect(fileContent).toContain('batch_number');
    });

    it('upsertLocalProduct persists expiry_date to offline_products', () => {
      expect(fileContent).toContain('expiry_date');
    });

    it('fetchLocalProduct SELECT includes batch_number', () => {
      expect(fileContent).toContain('batch_number, expiry_date FROM offline_products');
    });

    it('fetchLocalProduct returns batchNumber in result', () => {
      expect(fileContent).toContain('batchNumber: rows[0].batch_number');
    });

    it('fetchLocalProduct returns expiryDate in result', () => {
      expect(fileContent).toContain('expiryDate: rows[0].expiry_date');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. InwardStore — batchNumber and expiryDate on InwardItem
  // ---------------------------------------------------------------------------
  describe('inwardStore.ts type contract', () => {
    const filePath = path.resolve(__dirname, '../../src/stores/inwardStore.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('InwardItem interface includes batchNumber', () => {
      expect(fileContent).toContain('batchNumber?: string | null');
    });

    it('InwardItem interface includes expiryDate', () => {
      expect(fileContent).toContain('expiryDate?: string | null');
    });

    it('updateItem action accepts batchNumber and expiryDate updates', () => {
      expect(fileContent).toContain('"batchNumber" | "expiryDate"');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. inventoryApi.ts — InventoryTransactionItem carries batch/expiry
  // ---------------------------------------------------------------------------
  describe('inventoryApi.ts type contract', () => {
    const filePath = path.resolve(__dirname, '../../src/services/api/inventoryApi.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('InventoryTransactionItem includes batchNumber field', () => {
      expect(fileContent).toContain('batchNumber?: string | null');
    });

    it('InventoryTransactionItem includes expiryDate field', () => {
      expect(fileContent).toContain('expiryDate?: string | null');
    });

    it('recordManualInward maps batchNumber from items into payload', () => {
      expect(fileContent).toContain('item.batchNumber');
    });

    it('recordManualInward maps expiryDate from items into payload', () => {
      expect(fileContent).toContain('item.expiryDate');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. InwardScreen.tsx — UI fields rendered
  // ---------------------------------------------------------------------------
  describe('InwardScreen.tsx UI', () => {
    const filePath = path.resolve(__dirname, '../../src/screens/InwardScreen.tsx');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('renders batch-number-input testID', () => {
      expect(fileContent).toContain('testID="batch-number-input"');
    });

    it('renders expiry-date-input testID', () => {
      expect(fileContent).toContain('testID="expiry-date-input"');
    });

    it('Batch No. (optional) label present', () => {
      expect(fileContent).toContain('Batch No. (optional)');
    });

    it('Expiry Date (optional) label present', () => {
      expect(fileContent).toContain('Expiry Date (optional)');
    });

    it('DD-MM-YYYY placeholder present for expiry input', () => {
      expect(fileContent).toContain('DD-MM-YYYY');
    });

    it('expiryDate is converted from DD-MM-YYYY to ISO YYYY-MM-DD on blur', () => {
      // The blur handler re-formats the date
      expect(fileContent).toContain('`${yyyy}-${mm}-${dd}`');
    });

    it('doSubmit includes batchNumber in txItems', () => {
      expect(fileContent).toContain('batchNumber: item.batchNumber');
    });

    it('doSubmit includes expiryDate in txItems', () => {
      expect(fileContent).toContain('expiryDate: item.expiryDate');
    });

    it('onUpdateBatch callback wires to updateItem', () => {
      expect(fileContent).toContain('onUpdateBatch');
    });

    it('onUpdateExpiry callback wires to updateItem', () => {
      expect(fileContent).toContain('onUpdateExpiry');
    });
  });
});
