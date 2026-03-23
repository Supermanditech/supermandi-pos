/**
 * Canonical Procurement-to-Retail Conversion Engine
 * V3-FIX-167: One authoritative source for all unit conversion math.
 *
 * Every SKU has:
 *   procurement_unit  → what supplier ships (KG, CARTON, DOZEN, BAG, ...)
 *   procurement_pack_qty → how many base_stock_units per procurement_unit
 *   base_stock_unit   → canonical inventory unit (KG, GM, PCS, LTR, ML)
 *
 * Flows:
 *   Supplier → procurementToStock → inventory (base_stock_unit)
 *   Inventory → retailToStockDecrement → sale (variant/retail qty)
 */

// ---- Type definitions ----

/** Procurement units — includes packaging types used by suppliers */
export type ProcurementUnit =
  | 'KG' | 'GM' | 'PCS' | 'DOZEN' | 'LTR' | 'ML'
  | 'CARTON' | 'CASE' | 'BAG' | 'TIN' | 'DRUM'
  | 'TRAY' | 'BOTTLE' | 'PIECE' | 'PACK' | 'BOX';

/** Base stock units — canonical units for inventory tracking */
export type BaseStockUnit = 'KG' | 'GM' | 'PCS' | 'LTR' | 'ML';

/** Retail sell modes */
export type RetailSellMode = 'PACKAGED' | 'LOOSE_BULK';

/** Sold-by types for LOOSE_BULK products */
export type SoldByType = 'WEIGHT' | 'COUNT';

/** Rate units — consumer-facing unit for LOOSE_BULK pricing */
export type RateUnit = 'KG' | 'GM' | 'PCS' | 'DOZEN' | 'LTR' | 'ML';

/** Full conversion profile for a store product */
export interface ConversionProfile {
  procurementUnit: ProcurementUnit;
  procurementPackQty: number;
  baseStockUnit: BaseStockUnit;
  productMode: RetailSellMode;
  soldBy?: SoldByType;
  rateUnit?: RateUnit;
  allowFractionalSell: boolean;
  conversionPrecision: number;
  conversionConfirmed: boolean;
}

/** Suggested retail variant template */
export interface RetailVariantSuggestion {
  label: string;
  qty: number;
  unit: BaseStockUnit;
}

// ---- Constants ----

/** Valid procurement units */
export const VALID_PROCUREMENT_UNITS: ReadonlySet<string> = new Set([
  'KG', 'GM', 'PCS', 'DOZEN', 'LTR', 'ML',
  'CARTON', 'CASE', 'BAG', 'TIN', 'DRUM',
  'TRAY', 'BOTTLE', 'PIECE', 'PACK', 'BOX',
]);

/** Valid base stock units */
export const VALID_BASE_STOCK_UNITS: ReadonlySet<string> = new Set([
  'KG', 'GM', 'PCS', 'LTR', 'ML',
]);

/**
 * Unit family groups — units that can convert to each other.
 * Cross-family conversion is not allowed (e.g., KG → PCS is meaningless without a profile).
 */
const UNIT_FAMILIES: Record<string, string> = {
  KG: 'WEIGHT', GM: 'WEIGHT',
  LTR: 'VOLUME', ML: 'VOLUME',
  PCS: 'COUNT', DOZEN: 'COUNT', PIECE: 'COUNT',
  // Packaging types are COUNT-family (1 CARTON = N pieces/units)
  CARTON: 'COUNT', CASE: 'COUNT', BAG: 'COUNT',
  TIN: 'COUNT', DRUM: 'COUNT', TRAY: 'COUNT',
  BOTTLE: 'COUNT', PACK: 'COUNT', BOX: 'COUNT',
};

/**
 * Multiplier to convert FROM a unit TO the canonical base of its family.
 * WEIGHT family base = GM, VOLUME family base = ML, COUNT family base = PCS.
 */
const TO_FAMILY_BASE: Record<string, number> = {
  KG: 1000,    // 1 KG = 1000 GM
  GM: 1,
  LTR: 1000,   // 1 LTR = 1000 ML
  ML: 1,
  PCS: 1,
  DOZEN: 12,   // 1 DOZEN = 12 PCS
  PIECE: 1,
  // Packaging types: multiplier is procurement_pack_qty, not fixed
  CARTON: 1, CASE: 1, BAG: 1, TIN: 1, DRUM: 1, TRAY: 1, BOTTLE: 1, PACK: 1, BOX: 1,
};

// ---- Core conversion functions ----

/**
 * Convert procurement quantity to base stock quantity.
 *
 * Example: Buy 5 CARTONs of 24 PCS each → 120 PCS stock
 * Example: Buy 3 BAGs of 50 KG each → 150 KG stock
 */
export function procurementToStock(
  procurementQty: number,
  procurementPackQty: number,
): number {
  if (!Number.isFinite(procurementQty) || procurementQty < 0) return 0;
  if (!Number.isFinite(procurementPackQty) || procurementPackQty <= 0) return 0;
  return procurementQty * procurementPackQty;
}

/**
 * Convert a retail sale quantity to a base stock decrement.
 *
 * Example: Sell 2 units of "500 GM" variant from KG stock → decrement 1 KG (1000 GM)
 * Example: Sell 1 unit of "1 DOZEN" variant from PCS stock → decrement 12 PCS
 *
 * @param retailQty Number of units sold (e.g., 2)
 * @param variantQty Quantity per variant unit in variant's base_unit (e.g., 500 for "500 GM")
 * @param variantUnit Unit of the variant (e.g., "GM")
 * @param baseStockUnit Canonical stock unit (e.g., "KG")
 * @param precision Decimal places for rounding
 * @returns Positive number representing stock to deduct in baseStockUnit
 */
export function retailToStockDecrement(
  retailQty: number,
  variantQty: number,
  variantUnit: string,
  baseStockUnit: string,
  precision: number = 2,
): number {
  if (!Number.isFinite(retailQty) || retailQty <= 0) return 0;
  if (!Number.isFinite(variantQty) || variantQty <= 0) return 0;

  const multiplier = getUnitMultiplier(variantUnit, baseStockUnit);
  if (multiplier === null) return 0;

  const raw = retailQty * variantQty * multiplier;
  const factor = Math.pow(10, precision);
  return Math.round(raw * factor) / factor;
}

/**
 * Get the multiplier to convert FROM one unit TO another within the same family.
 *
 * Returns null if units are in different families (cross-family conversion not allowed).
 *
 * Example: GM → KG = 0.001
 * Example: KG → GM = 1000
 * Example: DOZEN → PCS = 12
 * Example: ML → LTR = 0.001
 */
export function getUnitMultiplier(fromUnit: string, toUnit: string): number | null {
  const from = fromUnit.toUpperCase().trim();
  const to = toUnit.toUpperCase().trim();
  if (from === to) return 1;

  const fromFamily = UNIT_FAMILIES[from];
  const toFamily = UNIT_FAMILIES[to];
  if (!fromFamily || !toFamily || fromFamily !== toFamily) return null;

  const fromBase = TO_FAMILY_BASE[from];
  const toBase = TO_FAMILY_BASE[to];
  if (!fromBase || !toBase) return null;

  // Convert: from → family base → to
  // e.g., GM → KG: fromBase=1, toBase=1000 → 1/1000 = 0.001
  return fromBase / toBase;
}

/**
 * Check if two units are in the same conversion family.
 */
export function areSameFamily(unitA: string, unitB: string): boolean {
  const a = unitA.toUpperCase().trim();
  const b = unitB.toUpperCase().trim();
  const familyA = UNIT_FAMILIES[a];
  const familyB = UNIT_FAMILIES[b];
  return !!familyA && familyA === familyB;
}

/**
 * Infer base_stock_unit from existing product fields.
 * Used for back-filling legacy products that don't have explicit conversion profiles.
 */
export function inferBaseStockUnit(
  productMode: string | null | undefined,
  soldBy: string | null | undefined,
  rateUnit: string | null | undefined,
  unit: string | null | undefined,
): BaseStockUnit {
  // LOOSE_BULK: infer from rateUnit
  if (productMode === 'LOOSE_BULK' && rateUnit) {
    const ru = rateUnit.toUpperCase().trim();
    if (ru === 'KG' || ru === 'GM') return 'KG';
    if (ru === 'LTR' || ru === 'ML') return 'LTR';
    if (ru === 'PCS' || ru === 'DOZEN') return 'PCS';
  }

  // Fallback: infer from generic unit field
  if (unit) {
    const u = unit.toUpperCase().trim();
    if (u === 'KG' || u === 'G' || u === 'GM') return 'KG';
    if (u === 'L' || u === 'LTR' || u === 'ML') return 'LTR';
  }

  // Default: packaged items are counted in pieces
  return 'PCS';
}

/**
 * Suggest common retail variants for a given base stock unit and sold-by type.
 * Kirana-friendly templates for the most common bulk-to-retail splits.
 */
export function suggestRetailVariants(
  baseStockUnit: BaseStockUnit,
  soldBy?: SoldByType,
): RetailVariantSuggestion[] {
  if (baseStockUnit === 'KG') {
    return [
      { label: '250 g', qty: 0.25, unit: 'KG' },
      { label: '500 g', qty: 0.5, unit: 'KG' },
      { label: '1 kg', qty: 1, unit: 'KG' },
      { label: '5 kg', qty: 5, unit: 'KG' },
    ];
  }
  if (baseStockUnit === 'GM') {
    return [
      { label: '100 g', qty: 100, unit: 'GM' },
      { label: '250 g', qty: 250, unit: 'GM' },
      { label: '500 g', qty: 500, unit: 'GM' },
    ];
  }
  if (baseStockUnit === 'LTR') {
    return [
      { label: '250 ml', qty: 0.25, unit: 'LTR' },
      { label: '500 ml', qty: 0.5, unit: 'LTR' },
      { label: '1 L', qty: 1, unit: 'LTR' },
    ];
  }
  if (baseStockUnit === 'ML') {
    return [
      { label: '100 ml', qty: 100, unit: 'ML' },
      { label: '250 ml', qty: 250, unit: 'ML' },
      { label: '500 ml', qty: 500, unit: 'ML' },
    ];
  }
  if (baseStockUnit === 'PCS') {
    if (soldBy === 'COUNT') {
      return [
        { label: '1 pc', qty: 1, unit: 'PCS' },
        { label: '6 pcs', qty: 6, unit: 'PCS' },
        { label: '12 pcs', qty: 12, unit: 'PCS' },
        { label: '1 dozen', qty: 12, unit: 'PCS' },
      ];
    }
    return [
      { label: '1 pc', qty: 1, unit: 'PCS' },
    ];
  }
  return [];
}

/**
 * Validate a conversion profile for consistency.
 * Returns null if valid, or an error message if invalid.
 */
export function validateConversionProfile(profile: Partial<ConversionProfile>): string | null {
  const { procurementUnit, procurementPackQty, baseStockUnit } = profile;

  if (procurementUnit && !VALID_PROCUREMENT_UNITS.has(procurementUnit)) {
    return `Invalid procurement_unit: ${procurementUnit}`;
  }
  if (baseStockUnit && !VALID_BASE_STOCK_UNITS.has(baseStockUnit)) {
    return `Invalid base_stock_unit: ${baseStockUnit}`;
  }

  if (procurementPackQty !== undefined && procurementPackQty !== null) {
    if (!Number.isFinite(procurementPackQty) || procurementPackQty <= 0) {
      return 'procurement_pack_qty must be a positive number';
    }
  }

  // If both procurement and stock units are set, verify they're compatible
  // Packaging types (CARTON, BAG, etc.) are always compatible with any base stock unit
  // because procurement_pack_qty bridges the gap.
  // But weight↔volume is never valid.
  if (procurementUnit && baseStockUnit) {
    const procFamily = UNIT_FAMILIES[procurementUnit];
    const stockFamily = UNIT_FAMILIES[baseStockUnit];
    // Packaging units are COUNT family — compatible with any stock unit via pack_qty
    const isPackagingType = ['CARTON', 'CASE', 'BAG', 'TIN', 'DRUM', 'TRAY', 'BOTTLE', 'PACK'].includes(procurementUnit);
    if (!isPackagingType && procFamily && stockFamily && procFamily !== stockFamily) {
      return `Cannot convert ${procurementUnit} (${procFamily}) to ${baseStockUnit} (${stockFamily})`;
    }
  }

  return null;
}

/**
 * Normalize a raw unit string to a valid ProcurementUnit or BaseStockUnit.
 * Handles common aliases and case variations.
 */
export function normalizeUnitString(raw: string): string {
  const u = raw.toUpperCase().trim();
  const aliases: Record<string, string> = {
    'G': 'GM',
    'GRAM': 'GM',
    'GRAMS': 'GM',
    'KILOGRAM': 'KG',
    'KILOGRAMS': 'KG',
    'L': 'LTR',
    'LITER': 'LTR',
    'LITRE': 'LTR',
    'LITRES': 'LTR',
    'LITERS': 'LTR',
    'MILLILITER': 'ML',
    'MILLILITRE': 'ML',
    'PC': 'PCS',
    'PIECE': 'PCS',
    'PIECES': 'PCS',
    'DOZ': 'DOZEN',
    'DZ': 'DOZEN',
    'CTN': 'CARTON',
    'CS': 'CASE',
    'BTL': 'BOTTLE',
    'PKT': 'PACK',
    'PACKET': 'PACK',
    'PACKETS': 'PACK',
    'BX': 'BOX',
    'BOXES': 'BOX',
  };
  return aliases[u] ?? u;
}
