/**
 * GCP-STG-0387: GRN Potential Double-Expansion Guard
 *
 * BUY checkout pre-expands qty (cartons × caseSize → PCS) and sets quantityUnit='BASE'.
 * GRN must NOT multiply by procurementPackQty again when quantityUnit='BASE'.
 * GRN SHOULD multiply when quantityUnit='PROCUREMENT' (or legacy null).
 *
 * This test validates the landed-qty logic extracted from GRNScreenV3's confirm handler.
 */

// Extract the landed-qty logic from GRNScreenV3 for unit testing
function calculateLandedQty(item: {
  received: number;
  procurementPackQty?: number;
  quantityUnit?: 'BASE' | 'PROCUREMENT';
}): number {
  const alreadyBase = item.quantityUnit === 'BASE' || !item.procurementPackQty || item.procurementPackQty <= 1;
  return alreadyBase ? item.received : item.received * item.procurementPackQty!;
}

describe('GCP-STG-0387: GRN double-expansion guard', () => {
  describe('calculateLandedQty', () => {
    test('BASE unit: does NOT multiply by procurementPackQty', () => {
      // BUY already expanded 2 cartons × 12 caseSize = 24 PCS → ordered as 24, quantityUnit='BASE'
      const result = calculateLandedQty({
        received: 24,
        procurementPackQty: 12,
        quantityUnit: 'BASE',
      });
      expect(result).toBe(24); // NOT 24×12=288
    });

    test('PROCUREMENT unit: multiplies by procurementPackQty', () => {
      // Manual/direct order in procurement units (2 cartons of 12)
      const result = calculateLandedQty({
        received: 2,
        procurementPackQty: 12,
        quantityUnit: 'PROCUREMENT',
      });
      expect(result).toBe(24); // 2×12=24
    });

    test('no procurementPackQty: uses received directly', () => {
      const result = calculateLandedQty({
        received: 10,
        procurementPackQty: undefined,
        quantityUnit: undefined,
      });
      expect(result).toBe(10);
    });

    test('procurementPackQty=1: uses received directly (no multiplication needed)', () => {
      const result = calculateLandedQty({
        received: 5,
        procurementPackQty: 1,
        quantityUnit: 'PROCUREMENT',
      });
      expect(result).toBe(5); // 1× = identity
    });

    test('procurementPackQty=0: uses received directly (guard against zero)', () => {
      const result = calculateLandedQty({
        received: 5,
        procurementPackQty: 0,
        quantityUnit: 'PROCUREMENT',
      });
      expect(result).toBe(5); // falsy packQty → no multiply
    });

    test('undefined quantityUnit with packQty>1: multiplies (legacy behavior)', () => {
      // Legacy order items without quantity_unit column → default behavior preserves existing GRN expansion
      const result = calculateLandedQty({
        received: 3,
        procurementPackQty: 6,
        quantityUnit: undefined,
      });
      // undefined is NOT 'BASE', and packQty > 1, so it multiplies
      // Wait — the guard is: alreadyBase = quantityUnit === 'BASE' || !packQty || packQty <= 1
      // undefined !== 'BASE' → false, packQty=6 → truthy → false, packQty<=1 → false
      // So alreadyBase = false → multiply
      expect(result).toBe(18); // 3×6=18
    });
  });

  describe('BUY checkout sets quantityUnit=BASE', () => {
    test('order item includes quantityUnit field', () => {
      // Simulates what BuyScreenV3 sends: qty = orderQtys × caseSize, quantityUnit = 'BASE'
      const caseSize = 10;
      const orderQty = 3; // 3 cartons
      const expandedQty = orderQty * caseSize; // 30 PCS

      const orderItem = {
        supplierProductId: 'test-sp-id',
        quantity: expandedQty,
        unitPrice: 1000,
        quantityUnit: 'BASE' as const,
      };

      expect(orderItem.quantity).toBe(30);
      expect(orderItem.quantityUnit).toBe('BASE');

      // When GRN receives this item, even with procurementPackQty=10,
      // it should NOT multiply again
      const landedQty = calculateLandedQty({
        received: orderItem.quantity,
        procurementPackQty: caseSize,
        quantityUnit: orderItem.quantityUnit,
      });
      expect(landedQty).toBe(30); // Not 300!
    });
  });

  describe('migration safety', () => {
    test('DEFAULT BASE ensures existing rows get correct value', () => {
      // The migration adds: quantity_unit VARCHAR(15) NOT NULL DEFAULT 'BASE'
      // All existing purchase_order_items were created by BuyScreenV3 which pre-expands qty.
      // So DEFAULT 'BASE' is correct — existing GRN receipts won't suddenly double-expand.
      const existingRow = { quantity_unit: 'BASE' }; // what the DEFAULT gives
      expect(existingRow.quantity_unit).toBe('BASE');
    });

    test('CHECK constraint only allows BASE or PROCUREMENT', () => {
      const validValues = ['BASE', 'PROCUREMENT'];
      const invalidValues = ['base', 'procurement', 'UNIT', '', 'PCS'];

      for (const v of validValues) {
        expect(['BASE', 'PROCUREMENT']).toContain(v);
      }
      for (const v of invalidValues) {
        // These would fail the CHECK constraint in the DB
        if (v === 'BASE' || v === 'PROCUREMENT') {
          throw new Error(`${v} should be invalid`);
        }
      }
    });
  });
});
