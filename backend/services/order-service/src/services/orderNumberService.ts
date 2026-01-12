// Order Number Service - V3.0.9 compliant
// Generates unique order numbers in format: PO-{storeCode}-{YY}-{NNNNNN}

import { getNextOrderSequence } from '../db/queries.js';

// =============================================================================
// ORDER NUMBER FORMAT
// =============================================================================

/**
 * Order number format: PO-{storeCode}-{YY}-{NNNNNN}
 * Example: PO-MUM01-26-000001
 *
 * Components:
 * - PO: Purchase Order prefix
 * - storeCode: Store identifier (e.g., MUM01, DEL02)
 * - YY: 2-digit year (e.g., 26 for 2026)
 * - NNNNNN: 6-digit sequence number, zero-padded
 */

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Generate the next unique order number for a store.
 * Uses database sequence with FOR UPDATE locking for atomicity.
 *
 * @param storeCode - Store code (e.g., "MUM01")
 * @param storeId - Store UUID for sequence tracking
 * @returns Order number string (e.g., "PO-MUM01-26-000001")
 */
export async function generateOrderNumber(
  storeCode: string,
  storeId: string
): Promise<string> {
  // Get current year (2-digit)
  const year = new Date().getFullYear() % 100;

  // Get next sequence number atomically
  const sequence = await getNextOrderSequence(storeId, storeCode, year);

  // Format: PO-{storeCode}-{YY}-{NNNNNN}
  const paddedSeq = sequence.toString().padStart(6, '0');
  const paddedYear = year.toString().padStart(2, '0');

  return `PO-${storeCode.toUpperCase()}-${paddedYear}-${paddedSeq}`;
}

/**
 * Parse an order number into its components.
 * Returns null if format is invalid.
 */
export function parseOrderNumber(orderNumber: string): {
  prefix: string;
  storeCode: string;
  year: number;
  sequence: number;
} | null {
  const match = orderNumber.match(/^(PO)-([A-Z0-9]+)-(\d{2})-(\d{6})$/);
  if (!match) return null;

  return {
    prefix: match[1],
    storeCode: match[2],
    year: parseInt(match[3], 10),
    sequence: parseInt(match[4], 10),
  };
}

/**
 * Validate order number format.
 */
export function isValidOrderNumber(orderNumber: string): boolean {
  return parseOrderNumber(orderNumber) !== null;
}

/**
 * Extract store code from order number.
 */
export function getStoreCodeFromOrderNumber(orderNumber: string): string | null {
  const parsed = parseOrderNumber(orderNumber);
  return parsed?.storeCode ?? null;
}
