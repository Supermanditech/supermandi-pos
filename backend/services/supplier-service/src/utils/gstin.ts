// GSTIN Validation Utility - V3.0.9 compliant
// Indian Goods and Services Tax Identification Number validation

/**
 * GSTIN Format: PPSSSSSSSSSSSC (15 characters)
 * - PP: State code (01-38)
 * - SSSSSSSSSS: PAN (10 characters)
 * - S: Entity number (1-9, A-Z)
 * - C: Check digit (modulus 36)
 *
 * Example: 29AABCU9603R1ZM
 * - 29: Karnataka state code
 * - AABCU9603R: PAN
 * - 1: Entity number
 * - Z: Check digit
 * - M: Version indicator (always 'Z' or alphanumeric)
 */

// Valid Indian state codes (01-38 plus special codes)
const VALID_STATE_CODES = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '32', '33', '34', '35', '36', '37', '38',
  // Special economic zones and other
  '96', '97', '99',
];

// GSTIN regex pattern
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;

// PAN regex pattern (embedded in GSTIN)
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/**
 * Character value mapping for checksum calculation
 * 0-9 = 0-9, A-Z = 10-35
 */
function charToValue(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 48 && code <= 57) {
    // 0-9
    return code - 48;
  }
  if (code >= 65 && code <= 90) {
    // A-Z
    return code - 55;
  }
  return -1;
}

/**
 * Value to character mapping for checksum
 */
function valueToChar(value: number): string {
  if (value < 10) {
    return String(value);
  }
  return String.fromCharCode(55 + value);
}

/**
 * Calculate GSTIN checksum using modulus 36 algorithm
 */
function calculateChecksum(gstin14: string): string {
  let sum = 0;

  for (let i = 0; i < 14; i++) {
    const char = gstin14[i];
    let value = charToValue(char);

    // Multiply by factor based on position (1 for odd, 2 for even)
    const factor = (i % 2) + 1;
    value = value * factor;

    // Quotient and remainder
    const quotient = Math.floor(value / 36);
    const remainder = value % 36;
    sum += quotient + remainder;
  }

  // Final checksum
  const checkDigit = (36 - (sum % 36)) % 36;
  return valueToChar(checkDigit);
}

export interface GstinValidationResult {
  isValid: boolean;
  errors: string[];
  stateCode?: string;
  stateName?: string;
  pan?: string;
  entityNumber?: string;
}

// State code to name mapping
const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '96': 'Other Territory',
  '97': 'Other Country',
  '99': 'Centre Jurisdiction',
};

/**
 * Validate a GSTIN string
 * Performs:
 * 1. Format validation (regex)
 * 2. State code validation
 * 3. PAN format validation
 * 4. Checksum validation
 */
export function validateGstin(gstin: string): GstinValidationResult {
  const errors: string[] = [];

  // Normalize input
  const normalized = gstin?.trim().toUpperCase() ?? '';

  // Check length
  if (normalized.length !== 15) {
    errors.push(`GSTIN must be exactly 15 characters, got ${normalized.length}`);
    return { isValid: false, errors };
  }

  // Check format
  if (!GSTIN_REGEX.test(normalized)) {
    errors.push('GSTIN format is invalid. Expected format: PPAAAAA9999A9ZC');
    return { isValid: false, errors };
  }

  // Extract components
  const stateCode = normalized.substring(0, 2);
  const pan = normalized.substring(2, 12);
  const entityNumber = normalized.substring(12, 13);
  const checkDigit = normalized.substring(14, 15);

  // Validate state code
  if (!VALID_STATE_CODES.includes(stateCode)) {
    errors.push(`Invalid state code: ${stateCode}`);
  }

  // Validate PAN format
  if (!PAN_REGEX.test(pan)) {
    errors.push(`Invalid PAN format in GSTIN: ${pan}`);
  }

  // Validate checksum
  const expectedCheckDigit = calculateChecksum(normalized.substring(0, 14));
  if (checkDigit !== expectedCheckDigit) {
    errors.push(`Invalid checksum. Expected ${expectedCheckDigit}, got ${checkDigit}`);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    stateCode,
    stateName: STATE_NAMES[stateCode],
    pan,
    entityNumber,
  };
}

/**
 * Quick check if GSTIN is valid (boolean only)
 */
export function isValidGstin(gstin: string): boolean {
  return validateGstin(gstin).isValid;
}

/**
 * Extract PAN from GSTIN
 */
export function extractPanFromGstin(gstin: string): string | null {
  const result = validateGstin(gstin);
  return result.isValid ? result.pan! : null;
}

/**
 * Extract state code from GSTIN
 */
export function extractStateFromGstin(gstin: string): { code: string; name: string } | null {
  const result = validateGstin(gstin);
  if (!result.isValid) return null;
  return {
    code: result.stateCode!,
    name: result.stateName!,
  };
}
