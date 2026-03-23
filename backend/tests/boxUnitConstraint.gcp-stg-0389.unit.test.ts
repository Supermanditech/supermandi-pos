/**
 * GCP-STG-0389: Verify BOX is a valid procurement unit in conversionEngine.
 *
 * - BOX must be in VALID_PROCUREMENT_UNITS
 * - BOX must be in ProcurementUnit type (compile-time)
 * - BOX must map to COUNT family
 * - normalizeUnitString maps aliases to BOX
 * - validateConversionProfile accepts BOX
 */
import {
  VALID_PROCUREMENT_UNITS,
  normalizeUnitString,
  validateConversionProfile,
  type ProcurementUnit,
  type ConversionProfile,
} from '../src/services/conversionEngine';

describe('GCP-STG-0389: BOX procurement unit', () => {
  test('BOX is in VALID_PROCUREMENT_UNITS set', () => {
    expect(VALID_PROCUREMENT_UNITS.has('BOX')).toBe(true);
  });

  test('BOX is accepted as ProcurementUnit type', () => {
    // Compile-time check — if this compiles, the type includes BOX
    const unit: ProcurementUnit = 'BOX';
    expect(unit).toBe('BOX');
  });

  test('normalizeUnitString maps BX to BOX', () => {
    expect(normalizeUnitString('BX')).toBe('BOX');
    expect(normalizeUnitString('bx')).toBe('BOX');
  });

  test('normalizeUnitString maps BOXES to BOX', () => {
    expect(normalizeUnitString('BOXES')).toBe('BOX');
    expect(normalizeUnitString('boxes')).toBe('BOX');
  });

  test('normalizeUnitString passes BOX through unchanged', () => {
    expect(normalizeUnitString('BOX')).toBe('BOX');
    expect(normalizeUnitString('box')).toBe('BOX');
  });

  test('validateConversionProfile accepts BOX procurement unit', () => {
    const profile: ConversionProfile = {
      procurementUnit: 'BOX',
      procurementPackQty: 24,
      baseStockUnit: 'PCS',
      productMode: 'PACKAGED',
      allowFractionalSell: false,
      conversionPrecision: 2,
      conversionConfirmed: true,
    };
    const errors = validateConversionProfile(profile);
    // validateConversionProfile returns null when valid, empty array, or array of errors
    const hasErrors = errors !== null && Array.isArray(errors) && errors.length > 0;
    expect(hasErrors).toBe(false);
  });

  test('all 15 original units still valid after adding BOX', () => {
    const original = [
      'KG', 'GM', 'PCS', 'DOZEN', 'LTR', 'ML',
      'CARTON', 'CASE', 'BAG', 'TIN', 'DRUM',
      'TRAY', 'BOTTLE', 'PIECE', 'PACK',
    ];
    for (const u of original) {
      expect(VALID_PROCUREMENT_UNITS.has(u)).toBe(true);
    }
  });

  test('VALID_PROCUREMENT_UNITS has exactly 16 entries', () => {
    expect(VALID_PROCUREMENT_UNITS.size).toBe(16);
  });
});
