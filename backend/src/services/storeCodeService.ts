/**
 * Store Code Service - STORECODE-002
 *
 * Transaction-safe generation of human-readable store codes.
 * Format: <PREFIX><YYMMDD>-<SEQ>
 * Example: SU260115-001 (SuperMandi, 2026-01-15, sequence 1)
 *
 * Rules:
 * - PREFIX: First 2 uppercase letters of store name (fallback: ST)
 * - YYMMDD: Server date in IST timezone
 * - SEQ: 3-digit sequence, resets daily per prefix
 */

import { pool } from "../db/client";

// =============================================================================
// CONSTANTS - STORECODE-004
// =============================================================================

/**
 * Demo store code prefixes - stores with these prefixes can be seeded.
 * Production stores use all OTHER prefixes and must NEVER be seeded.
 */
export const DEMO_PREFIXES = ["DM", "QA", "TS", "ST"] as const;

// =============================================================================
// TYPES
// =============================================================================

export interface StoreCodeResult {
  code: string;
  prefix: string;
  date: string;
  sequence: number;
}

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Generate a unique store code using the database function.
 * This is transaction-safe and handles concurrency correctly.
 *
 * @param storeName - The store name to derive the prefix from
 * @returns The generated store code
 *
 * @example
 * const code = await generateStoreCode("SuperMandi Store");
 * // Returns: "SU260115-001"
 */
export async function generateStoreCode(storeName: string): Promise<string> {
  const result = await pool.query<{ generate_store_code: string }>(
    "SELECT platform.generate_store_code($1) as generate_store_code",
    [storeName]
  );

  return result.rows[0].generate_store_code;
}

/**
 * Generate a store code with detailed breakdown.
 *
 * @param storeName - The store name to derive the prefix from
 * @returns Object with code and its components
 */
export async function generateStoreCodeDetailed(
  storeName: string
): Promise<StoreCodeResult> {
  const code = await generateStoreCode(storeName);

  // Parse the code to extract components
  // Format: PREFIX(2) + YYMMDD(6) + '-' + SEQ(3)
  const prefix = code.substring(0, 2);
  const date = code.substring(2, 8);
  const sequence = parseInt(code.substring(9), 10);

  return {
    code,
    prefix,
    date,
    sequence,
  };
}

/**
 * Validate a store code format.
 *
 * @param code - The code to validate
 * @returns true if valid format
 */
export function isValidStoreCodeFormat(code: string): boolean {
  // Format: XX999999-999 (e.g., SU260115-001)
  const pattern = /^[A-Z]{2}[0-9]{6}-[0-9]{3}$/;
  return pattern.test(code);
}

/**
 * Parse a store code into its components.
 *
 * @param code - The store code to parse
 * @returns Parsed components or null if invalid
 */
export function parseStoreCode(code: string): StoreCodeResult | null {
  if (!isValidStoreCodeFormat(code)) {
    return null;
  }

  return {
    code,
    prefix: code.substring(0, 2),
    date: code.substring(2, 8),
    sequence: parseInt(code.substring(9), 10),
  };
}

/**
 * Legacy demo code patterns - codes containing these substrings are demo stores.
 * Handles pre-STORECODE migration codes like "sm-demo02", "test-store-1", etc.
 */
const LEGACY_DEMO_PATTERNS = ["demo", "test", "qa-", "staging"];

/**
 * Check if a store code is a demo/QA store code.
 * STORECODE-004: Demo stores can be seeded, production stores cannot.
 *
 * Matches:
 * - New format: Codes starting with DM, QA, TS, ST prefixes
 * - Legacy format: Codes containing "demo", "test", "qa-", "staging"
 *
 * @param code - The store code to check
 * @returns true if this is a demo store (can be seeded)
 */
export function isDemoStoreCode(code: string): boolean {
  if (!code || code.length < 2) return false;

  // Check new format prefixes
  const prefix = code.substring(0, 2).toUpperCase();
  if ((DEMO_PREFIXES as readonly string[]).includes(prefix)) {
    return true;
  }

  // Check legacy patterns (case-insensitive)
  const lowerCode = code.toLowerCase();
  return LEGACY_DEMO_PATTERNS.some((pattern) => lowerCode.includes(pattern));
}

/**
 * Check if a store code is a production store code.
 * STORECODE-004: Production stores must NEVER be seeded.
 *
 * @param code - The store code to check
 * @returns true if this is a production store (cannot be seeded)
 */
export function isProductionStoreCode(code: string): boolean {
  if (!code || code.length < 2) return true; // Assume production if invalid
  return !isDemoStoreCode(code);
}

/**
 * Guard function to prevent seeding production stores.
 * STORECODE-004: Throws if attempting to seed a non-demo store.
 *
 * @param code - The store code to check
 * @param operation - Description of the operation for error message
 * @throws Error if store is not a demo store
 */
export function assertDemoStoreCode(code: string, operation: string): void {
  if (!isDemoStoreCode(code)) {
    throw new Error(
      `[BLOCKED] ${operation}: Store code "${code}" is not a demo store. ` +
        `Demo stores must use prefixes (${DEMO_PREFIXES.join(", ")}) or contain: ${LEGACY_DEMO_PATTERNS.join(", ")}`
    );
  }
}

/**
 * Extract prefix from store name.
 * Used by the database function but exposed here for consistency.
 *
 * @param storeName - The store name
 * @returns 2-character uppercase prefix
 */
export function extractPrefixFromName(storeName: string): string {
  // Remove non-letters and uppercase
  const letters = storeName.replace(/[^A-Za-z]/g, "").toUpperCase();

  if (letters.length < 2) {
    return "ST"; // Default fallback
  }

  return letters.substring(0, 2);
}

/**
 * Format a date as YYMMDD in IST timezone.
 *
 * @param date - The date to format (defaults to now)
 * @returns YYMMDD string
 */
export function formatDateYYMMDD(date: Date = new Date()): string {
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);

  const yy = istDate.getUTCFullYear().toString().slice(-2);
  const mm = (istDate.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = istDate.getUTCDate().toString().padStart(2, "0");

  return `${yy}${mm}${dd}`;
}

/**
 * Get current counter stats for a prefix (for monitoring/debugging).
 *
 * @param prefix - The 2-letter prefix
 * @returns Counter info or null if not found
 */
export async function getCounterStats(
  prefix: string
): Promise<{ prefix: string; yymmdd: string; lastSeq: number } | null> {
  const result = await pool.query<{
    prefix: string;
    yymmdd: string;
    last_seq: number;
  }>(
    `SELECT prefix, yymmdd, last_seq
     FROM platform.store_code_counters
     WHERE prefix = $1
     ORDER BY yymmdd DESC
     LIMIT 1`,
    [prefix.toUpperCase()]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    prefix: row.prefix,
    yymmdd: row.yymmdd,
    lastSeq: row.last_seq,
  };
}

// =============================================================================
// UNIT TEST HELPERS (for concurrency testing)
// =============================================================================

/**
 * Test concurrent store code generation.
 * Creates N stores in parallel and verifies no duplicate codes.
 *
 * @param count - Number of concurrent creations
 * @param baseStoreName - Base name for test stores
 * @returns Array of generated codes
 */
export async function testConcurrentGeneration(
  count: number,
  baseStoreName: string = "Test Store"
): Promise<string[]> {
  const promises = Array.from({ length: count }, (_, i) =>
    generateStoreCode(`${baseStoreName} ${i + 1}`)
  );

  const codes = await Promise.all(promises);

  // Check for duplicates
  const uniqueCodes = new Set(codes);
  if (uniqueCodes.size !== codes.length) {
    throw new Error(
      `Duplicate codes generated! Got ${uniqueCodes.size} unique out of ${codes.length}`
    );
  }

  return codes;
}
