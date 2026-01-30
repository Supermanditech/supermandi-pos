/**
 * GO-LIVE Batch 3: Comprehensive Input Validation Utilities
 * Addresses tickets: GO-LIVE-146 through GO-LIVE-165
 *
 * This module provides centralized validation functions for all input types
 * across the SuperMandi platform.
 */

// =============================================================================
// GO-LIVE-147, GO-LIVE-150: XSS Sanitization
// =============================================================================

/**
 * HTML escape characters that could be used for XSS attacks
 * GO-LIVE-147: Product names/descriptions
 * GO-LIVE-150: Store names
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Sanitize string to prevent XSS attacks
 * Escapes HTML special characters
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Check if string contains potential XSS characters
 */
export function containsXssCharacters(input: string): boolean {
  if (!input) return false;
  return /[<>"'`]|javascript:|data:|vbscript:|on\w+=/i.test(input);
}

/**
 * Validate and sanitize product name
 * GO-LIVE-147: XSS prevention for product names
 */
export function validateProductName(name: unknown): { valid: boolean; value?: string; error?: string } {
  if (typeof name !== 'string') {
    return { valid: false, error: 'product_name_required' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'product_name_required' };
  }

  if (trimmed.length > 200) {
    return { valid: false, error: 'product_name_too_long_max_200' };
  }

  if (containsXssCharacters(trimmed)) {
    // Sanitize instead of reject - allow safe version
    return { valid: true, value: sanitizeHtml(trimmed) };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate and sanitize store name
 * GO-LIVE-150: XSS prevention for store names
 */
export function validateStoreName(name: unknown): { valid: boolean; value?: string; error?: string } {
  if (typeof name !== 'string') {
    return { valid: false, error: 'store_name_required' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'store_name_required' };
  }

  if (trimmed.length < 2) {
    return { valid: false, error: 'store_name_too_short_min_2' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'store_name_too_long_max_100' };
  }

  if (containsXssCharacters(trimmed)) {
    return { valid: true, value: sanitizeHtml(trimmed) };
  }

  return { valid: true, value: trimmed };
}

// =============================================================================
// GO-LIVE-148: Barcode Length Validation
// =============================================================================

const MAX_BARCODE_LENGTH = 50;
const MIN_BARCODE_LENGTH = 3;

/**
 * Validate barcode length to prevent DoS via oversized barcodes
 * GO-LIVE-148: Prevents memory exhaustion from 1MB+ barcodes
 */
export function validateBarcode(barcode: unknown): { valid: boolean; value?: string; error?: string } {
  if (barcode === null || barcode === undefined) {
    return { valid: true, value: undefined }; // Optional field
  }

  if (typeof barcode !== 'string') {
    return { valid: false, error: 'barcode_invalid_type' };
  }

  const trimmed = barcode.trim();
  if (!trimmed) {
    return { valid: true, value: undefined }; // Empty is OK
  }

  if (trimmed.length < MIN_BARCODE_LENGTH) {
    return { valid: false, error: `barcode_too_short_min_${MIN_BARCODE_LENGTH}` };
  }

  if (trimmed.length > MAX_BARCODE_LENGTH) {
    return { valid: false, error: `barcode_too_long_max_${MAX_BARCODE_LENGTH}` };
  }

  // Only allow alphanumeric and common barcode characters
  if (!/^[A-Za-z0-9\-_.]+$/.test(trimmed)) {
    return { valid: false, error: 'barcode_invalid_characters' };
  }

  return { valid: true, value: trimmed };
}

// =============================================================================
// GO-LIVE-149: Device Fingerprint Validation
// =============================================================================

const MAX_DEVICE_FINGERPRINT_LENGTH = 256;

/**
 * Validate device fingerprint - reject arbitrary binary data
 * GO-LIVE-149: Prevents buffer overflow and injection attacks
 */
export function validateDeviceFingerprint(fingerprint: unknown): { valid: boolean; value?: string; error?: string } {
  if (fingerprint === null || fingerprint === undefined) {
    return { valid: true, value: undefined };
  }

  if (typeof fingerprint !== 'string') {
    return { valid: false, error: 'device_fingerprint_invalid_type' };
  }

  const trimmed = fingerprint.trim();
  if (!trimmed) {
    return { valid: true, value: undefined };
  }

  if (trimmed.length > MAX_DEVICE_FINGERPRINT_LENGTH) {
    return { valid: false, error: `device_fingerprint_too_long_max_${MAX_DEVICE_FINGERPRINT_LENGTH}` };
  }

  // Only allow base64 or hex characters (typical fingerprint formats)
  if (!/^[A-Za-z0-9+/=\-_]+$/.test(trimmed)) {
    return { valid: false, error: 'device_fingerprint_invalid_format' };
  }

  return { valid: true, value: trimmed };
}

// =============================================================================
// GO-LIVE-151: Price Validation with Lower Bound
// =============================================================================

const MIN_PRICE_MINOR = 1; // 0.01 rupees minimum (1 paisa)
const MAX_PRICE_MINOR = 1000000000; // 10M INR maximum (1B paise)

/**
 * Validate price with proper bounds
 * GO-LIVE-151: Ensures price >= 0.01 (1 paisa minimum)
 */
export function validatePrice(
  price: unknown,
  options: { fieldName?: string; allowZero?: boolean; required?: boolean } = {}
): { valid: boolean; value?: number; error?: string } {
  const { fieldName = 'price', allowZero = false, required = true } = options;

  if (price === null || price === undefined || price === '') {
    if (required) {
      return { valid: false, error: `${fieldName}_required` };
    }
    return { valid: true, value: undefined };
  }

  const numPrice = Number(price);

  if (!Number.isFinite(numPrice)) {
    return { valid: false, error: `${fieldName}_invalid` };
  }

  if (allowZero && numPrice === 0) {
    return { valid: true, value: 0 };
  }

  if (numPrice < MIN_PRICE_MINOR) {
    return { valid: false, error: `${fieldName}_below_minimum_${MIN_PRICE_MINOR}` };
  }

  if (numPrice > MAX_PRICE_MINOR) {
    return { valid: false, error: `${fieldName}_exceeds_maximum` };
  }

  // GO-LIVE-160: Ensure integer precision (no floating point)
  if (!Number.isInteger(numPrice)) {
    return { valid: true, value: Math.round(numPrice) };
  }

  return { valid: true, value: numPrice };
}

// =============================================================================
// GO-LIVE-152: GSTIN Validation (comprehensive, already exists in supplier-service)
// GO-LIVE-153: Email Validation
// GO-LIVE-154: Phone Validation
// GO-LIVE-155: PIN Code Validation
// GO-LIVE-156: PAN Validation
// =============================================================================

/**
 * Comprehensive email validation
 * GO-LIVE-153: Proper email regex (not just checking for "@")
 */
export function validateEmail(email: unknown): { valid: boolean; value?: string; error?: string } {
  if (email === null || email === undefined || email === '') {
    return { valid: true, value: undefined }; // Optional field
  }

  if (typeof email !== 'string') {
    return { valid: false, error: 'email_invalid_type' };
  }

  const trimmed = email.trim().toLowerCase();

  // RFC 5322 compliant regex (simplified but comprehensive)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'email_invalid_format' };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'email_too_long' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Indian phone number validation
 * GO-LIVE-154: Validates Indian mobile format
 */
export function validatePhone(phone: unknown): { valid: boolean; value?: string; error?: string } {
  if (phone === null || phone === undefined || phone === '') {
    return { valid: true, value: undefined }; // Optional field
  }

  if (typeof phone !== 'string') {
    return { valid: false, error: 'phone_invalid_type' };
  }

  // Remove spaces, dashes, and common separators
  const cleaned = phone.replace(/[\s\-().]/g, '');

  // Indian mobile: 10 digits starting with 6-9, optionally prefixed with +91 or 0
  const indianMobileRegex = /^(?:\+91|91|0)?([6-9]\d{9})$/;
  const match = cleaned.match(indianMobileRegex);

  if (!match) {
    return { valid: false, error: 'phone_invalid_format' };
  }

  // Return normalized format: 10 digits
  return { valid: true, value: match[1] };
}

/**
 * Indian PIN code validation
 * GO-LIVE-155: Numeric only, 6 digits
 */
export function validatePinCode(pinCode: unknown): { valid: boolean; value?: string; error?: string } {
  if (pinCode === null || pinCode === undefined || pinCode === '') {
    return { valid: true, value: undefined }; // Optional field
  }

  const str = String(pinCode).trim();

  // Must be exactly 6 digits, first digit cannot be 0
  if (!/^[1-9]\d{5}$/.test(str)) {
    return { valid: false, error: 'pin_code_invalid_format' };
  }

  return { valid: true, value: str };
}

/**
 * Indian PAN validation with trimming
 * GO-LIVE-156: Trims spaces and validates format
 */
export function validatePan(pan: unknown): { valid: boolean; value?: string; error?: string } {
  if (pan === null || pan === undefined || pan === '') {
    return { valid: true, value: undefined }; // Optional field
  }

  if (typeof pan !== 'string') {
    return { valid: false, error: 'pan_invalid_type' };
  }

  // Trim spaces and convert to uppercase
  const trimmed = pan.replace(/\s/g, '').toUpperCase();

  // PAN format: AAAAA9999A (5 letters, 4 digits, 1 letter)
  // 4th character indicates type: P=Person, C=Company, H=HUF, etc.
  const panRegex = /^[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]$/;

  if (!panRegex.test(trimmed)) {
    return { valid: false, error: 'pan_invalid_format' };
  }

  return { valid: true, value: trimmed };
}

// =============================================================================
// GO-LIVE-157: Textarea Max Length Validation
// GO-LIVE-158: Search Query Length Validation
// =============================================================================

/**
 * Validate textarea fields with max length
 * GO-LIVE-157: Prevents DoS via oversized text fields
 */
export function validateTextarea(
  text: unknown,
  options: { maxLength?: number; fieldName?: string } = {}
): { valid: boolean; value?: string; error?: string } {
  const { maxLength = 2000, fieldName = 'text' } = options;

  if (text === null || text === undefined || text === '') {
    return { valid: true, value: undefined };
  }

  if (typeof text !== 'string') {
    return { valid: false, error: `${fieldName}_invalid_type` };
  }

  const trimmed = text.trim();

  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName}_too_long_max_${maxLength}` };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate search query to prevent regex DoS
 * GO-LIVE-158: Limits length and sanitizes special regex characters
 */
export function validateSearchQuery(query: unknown): { valid: boolean; value?: string; error?: string } {
  if (query === null || query === undefined || query === '') {
    return { valid: true, value: undefined };
  }

  if (typeof query !== 'string') {
    return { valid: false, error: 'search_query_invalid_type' };
  }

  const trimmed = query.trim();

  // Limit search query length to prevent regex DoS
  const MAX_SEARCH_LENGTH = 100;
  if (trimmed.length > MAX_SEARCH_LENGTH) {
    return { valid: false, error: `search_query_too_long_max_${MAX_SEARCH_LENGTH}` };
  }

  // Escape regex special characters to prevent ReDoS
  const sanitized = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return { valid: true, value: sanitized };
}

// =============================================================================
// GO-LIVE-159: File Size Validation
// =============================================================================

const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024; // 5MB (not 10MB)

/**
 * Validate file size
 * GO-LIVE-159: Ensures consistent file size limits
 */
export function validateFileSize(
  sizeBytes: number,
  options: { maxSize?: number; fileType?: string } = {}
): { valid: boolean; error?: string } {
  const { maxSize = MAX_CSV_FILE_SIZE, fileType = 'file' } = options;

  if (sizeBytes > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `${fileType}_exceeds_${maxMB}MB_limit` };
  }

  return { valid: true };
}

// =============================================================================
// GO-LIVE-161: Audio Buffer Size Validation
// =============================================================================

const MAX_AUDIO_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB max for audio

/**
 * Validate audio buffer size to prevent OOM
 * GO-LIVE-161: Limits audio buffer to prevent memory exhaustion
 */
export function validateAudioBufferSize(sizeBytes: number): { valid: boolean; error?: string } {
  if (sizeBytes > MAX_AUDIO_BUFFER_SIZE) {
    return { valid: false, error: 'audio_buffer_exceeds_10MB_limit' };
  }
  return { valid: true };
}

// =============================================================================
// GO-LIVE-162: Product Category Validation
// =============================================================================

/**
 * Validate product category ID
 * GO-LIVE-162: Ensures category ID is valid UUID or null
 */
export function validateCategoryId(categoryId: unknown): { valid: boolean; value?: string | null; error?: string } {
  if (categoryId === null || categoryId === undefined || categoryId === '' || categoryId === 'all') {
    return { valid: true, value: null };
  }

  if (typeof categoryId !== 'string') {
    return { valid: false, error: 'category_id_invalid_type' };
  }

  const trimmed = categoryId.trim();

  // UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(trimmed)) {
    return { valid: false, error: 'category_id_invalid_uuid' };
  }

  return { valid: true, value: trimmed.toLowerCase() };
}

// =============================================================================
// GO-LIVE-163: MOQ (Minimum Order Quantity) Validation
// =============================================================================

const MIN_MOQ = 1;
const MAX_MOQ = 1000000; // 1 million units max

/**
 * Validate MOQ with min/max bounds
 * GO-LIVE-163: Ensures MOQ is within reasonable bounds
 */
export function validateMoq(moq: unknown): { valid: boolean; value?: number; error?: string } {
  if (moq === null || moq === undefined || moq === '') {
    return { valid: true, value: undefined };
  }

  const numMoq = Number(moq);

  if (!Number.isFinite(numMoq) || !Number.isInteger(numMoq)) {
    return { valid: false, error: 'moq_must_be_integer' };
  }

  if (numMoq < MIN_MOQ) {
    return { valid: false, error: `moq_below_minimum_${MIN_MOQ}` };
  }

  if (numMoq > MAX_MOQ) {
    return { valid: false, error: `moq_exceeds_maximum_${MAX_MOQ}` };
  }

  return { valid: true, value: numMoq };
}

// =============================================================================
// GO-LIVE-164: Margin Validation
// =============================================================================

/**
 * Validate margin percentage
 * GO-LIVE-164: Ensures margin is 0-100% (or slightly negative for loss-leaders)
 */
export function validateMargin(margin: unknown): { valid: boolean; value?: number; error?: string } {
  if (margin === null || margin === undefined || margin === '') {
    return { valid: true, value: undefined };
  }

  const numMargin = Number(margin);

  if (!Number.isFinite(numMargin)) {
    return { valid: false, error: 'margin_invalid' };
  }

  // Allow small negative margins for loss-leaders (-10% to 100%)
  if (numMargin < -10) {
    return { valid: false, error: 'margin_too_low_min_-10' };
  }

  if (numMargin > 100) {
    return { valid: false, error: 'margin_exceeds_100_percent' };
  }

  return { valid: true, value: Number(numMargin.toFixed(2)) };
}

// =============================================================================
// GO-LIVE-165: BNPL Max Days Validation
// =============================================================================

const MIN_BNPL_DAYS = 1;
const MAX_BNPL_DAYS = 90; // Max 90 days credit period

/**
 * Validate BNPL max days
 * GO-LIVE-165: Ensures BNPL days is positive and within limits
 */
export function validateBnplMaxDays(days: unknown): { valid: boolean; value?: number; error?: string } {
  if (days === null || days === undefined || days === '') {
    return { valid: true, value: undefined };
  }

  const numDays = Number(days);

  if (!Number.isFinite(numDays) || !Number.isInteger(numDays)) {
    return { valid: false, error: 'bnpl_days_must_be_integer' };
  }

  if (numDays < MIN_BNPL_DAYS) {
    return { valid: false, error: `bnpl_days_below_minimum_${MIN_BNPL_DAYS}` };
  }

  if (numDays > MAX_BNPL_DAYS) {
    return { valid: false, error: `bnpl_days_exceeds_maximum_${MAX_BNPL_DAYS}` };
  }

  return { valid: true, value: numDays };
}

// =============================================================================
// GO-LIVE-146: SQL Injection Prevention (groupBy whitelist)
// =============================================================================

const VALID_GROUP_BY_VALUES = ['minute', 'hour', 'day', 'category'] as const;

/**
 * Validate analytics groupBy parameter to prevent SQL injection
 * GO-LIVE-146: Whitelist-only validation for SQL interpolation
 */
export function validateAnalyticsGroupBy(
  groupBy: unknown,
  allowedValues: readonly string[] = VALID_GROUP_BY_VALUES,
  defaultValue: string = 'hour'
): string {
  if (typeof groupBy !== 'string') {
    return defaultValue;
  }

  const trimmed = groupBy.trim().toLowerCase();

  if (allowedValues.includes(trimmed as any)) {
    return trimmed;
  }

  return defaultValue;
}

// =============================================================================
// Composite Validation Helper
// =============================================================================

export interface ValidationError {
  field: string;
  error: string;
}

/**
 * Batch validate multiple fields and collect errors
 */
export function collectValidationErrors(
  validations: Array<{ field: string; result: { valid: boolean; error?: string } }>
): ValidationError[] {
  return validations
    .filter(v => !v.result.valid && v.result.error)
    .map(v => ({ field: v.field, error: v.result.error! }));
}

// =============================================================================
// Export Constants
// =============================================================================

export const VALIDATION_CONSTANTS = {
  MAX_BARCODE_LENGTH,
  MIN_BARCODE_LENGTH,
  MAX_DEVICE_FINGERPRINT_LENGTH,
  MIN_PRICE_MINOR,
  MAX_PRICE_MINOR,
  MAX_CSV_FILE_SIZE,
  MAX_AUDIO_BUFFER_SIZE,
  MIN_MOQ,
  MAX_MOQ,
  MIN_BNPL_DAYS,
  MAX_BNPL_DAYS,
  VALID_GROUP_BY_VALUES,
};
