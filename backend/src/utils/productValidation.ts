/**
 * T-186: Unified Product Validation
 *
 * Centralized validators for product fields used across:
 * - POS product creation (store-products endpoint)
 * - Retailer Admin product creation
 * - CSV import validation
 * - Supplier product submission
 *
 * All money values are in minor units (paise = BIGINT).
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MIN_PRODUCT_NAME_LENGTH = 2;
const MAX_PRODUCT_NAME_LENGTH = 500;

const MIN_BARCODE_LENGTH = 3;
const MAX_BARCODE_LENGTH = 50;

// Price in minor units (paise): 1 paisa minimum, 10M INR = 1B paise maximum
const MIN_PRICE_MINOR = 1;
const MAX_PRICE_MINOR = 1_000_000_000;

// Stock quantity bounds
const MAX_STOCK_QTY = 10_000_000; // 10 million units max

// =============================================================================
// BARCODE PATTERNS
// =============================================================================

/** Standard barcode formats */
const BARCODE_PATTERNS = {
  EAN13: /^\d{13}$/,
  EAN8: /^\d{8}$/,
  UPC_A: /^\d{12}$/,
  // Internal SuperMandi barcodes: SM-xxx or 2xxxxx (store-scoped)
  INTERNAL: /^(SM-[A-Z0-9]{3,20}|2\d{5,20})$/i,
  // Generic numeric barcodes (6-14 digits covers most standard formats)
  GENERIC_NUMERIC: /^\d{6,14}$/,
  // Alphanumeric custom barcodes (retailer-defined)
  CUSTOM: /^[A-Za-z0-9\-_.]{3,50}$/,
};

// =============================================================================
// VALIDATORS
// =============================================================================

/**
 * Validate product name.
 * Rules: min 2 chars, max 500 chars, must contain at least one letter/digit.
 */
export function validateProductName(name: string): ValidationResult {
  if (typeof name !== "string") {
    return { valid: false, error: "Product name must be a string" };
  }

  const trimmed = name.trim();

  if (trimmed.length < MIN_PRODUCT_NAME_LENGTH) {
    return {
      valid: false,
      error: `Product name must be at least ${MIN_PRODUCT_NAME_LENGTH} characters`,
    };
  }

  if (trimmed.length > MAX_PRODUCT_NAME_LENGTH) {
    return {
      valid: false,
      error: `Product name must be at most ${MAX_PRODUCT_NAME_LENGTH} characters`,
    };
  }

  // Must contain at least one alphanumeric character
  if (!/[A-Za-z0-9\u0900-\u097F\u0980-\u09FF]/.test(trimmed)) {
    return {
      valid: false,
      error: "Product name must contain at least one letter or digit",
    };
  }

  return { valid: true };
}

/**
 * Validate barcode.
 * Accepts EAN-8, EAN-13, UPC-A, internal SuperMandi barcodes, or custom alphanumeric.
 * Empty/null barcode is valid (optional field — LOOSE_BULK products may not have one).
 */
export function validateBarcode(barcode: string): ValidationResult {
  if (barcode === null || barcode === undefined || barcode === "") {
    // Barcode is optional (loose/bulk products)
    return { valid: true };
  }

  if (typeof barcode !== "string") {
    return { valid: false, error: "Barcode must be a string" };
  }

  const trimmed = barcode.trim();

  if (trimmed.length === 0) {
    return { valid: true }; // Empty after trim is fine
  }

  if (trimmed.length < MIN_BARCODE_LENGTH) {
    return {
      valid: false,
      error: `Barcode must be at least ${MIN_BARCODE_LENGTH} characters`,
    };
  }

  if (trimmed.length > MAX_BARCODE_LENGTH) {
    return {
      valid: false,
      error: `Barcode must be at most ${MAX_BARCODE_LENGTH} characters`,
    };
  }

  // Check if it matches any known barcode format
  const matchesKnown =
    BARCODE_PATTERNS.EAN13.test(trimmed) ||
    BARCODE_PATTERNS.EAN8.test(trimmed) ||
    BARCODE_PATTERNS.UPC_A.test(trimmed) ||
    BARCODE_PATTERNS.INTERNAL.test(trimmed) ||
    BARCODE_PATTERNS.GENERIC_NUMERIC.test(trimmed) ||
    BARCODE_PATTERNS.CUSTOM.test(trimmed);

  if (!matchesKnown) {
    return {
      valid: false,
      error: "Invalid barcode format. Must be EAN-8, EAN-13, UPC-A, or alphanumeric (3-50 chars)",
    };
  }

  return { valid: true };
}

/**
 * Validate price in minor units (paise).
 * Must be a positive integer. Zero is NOT allowed for sell prices.
 */
export function validatePrice(price: number): ValidationResult {
  if (price === null || price === undefined) {
    return { valid: false, error: "Price is required" };
  }

  if (typeof price !== "number" || !Number.isFinite(price)) {
    return { valid: false, error: "Price must be a finite number" };
  }

  if (price < MIN_PRICE_MINOR) {
    return {
      valid: false,
      error: `Price must be at least ${MIN_PRICE_MINOR} (minor units / paise)`,
    };
  }

  if (price > MAX_PRICE_MINOR) {
    return {
      valid: false,
      error: `Price exceeds maximum allowed value of ${MAX_PRICE_MINOR} paise`,
    };
  }

  if (!Number.isInteger(price)) {
    // Not an error per se but we flag it — callers should Math.round()
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Validate stock quantity.
 * Must be a non-negative integer.
 */
export function validateStock(qty: number): ValidationResult {
  if (qty === null || qty === undefined) {
    return { valid: false, error: "Stock quantity is required" };
  }

  if (typeof qty !== "number" || !Number.isFinite(qty)) {
    return { valid: false, error: "Stock quantity must be a finite number" };
  }

  if (qty < 0) {
    return { valid: false, error: "Stock quantity cannot be negative" };
  }

  if (qty > MAX_STOCK_QTY) {
    return {
      valid: false,
      error: `Stock quantity exceeds maximum of ${MAX_STOCK_QTY}`,
    };
  }

  if (!Number.isInteger(qty)) {
    // Fractional stock is technically valid for loose/bulk (kg, liters)
    return { valid: true };
  }

  return { valid: true };
}

// =============================================================================
// EXPORTS — Constants for reference
// =============================================================================

export const PRODUCT_VALIDATION_CONSTANTS = {
  MIN_PRODUCT_NAME_LENGTH,
  MAX_PRODUCT_NAME_LENGTH,
  MIN_BARCODE_LENGTH,
  MAX_BARCODE_LENGTH,
  MIN_PRICE_MINOR,
  MAX_PRICE_MINOR,
  MAX_STOCK_QTY,
};
