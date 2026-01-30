/**
 * Batch 3 Real User Testing Script
 * GO-LIVE-146 to GO-LIVE-165: Input Validation & Sanitization
 *
 * Run: npx ts-node scripts/test-batch3-real-user.ts
 */

import {
  sanitizeHtml,
  validateBarcode,
  validateDeviceFingerprint,
  validatePrice,
  validateEmail,
  validatePhone,
  validatePinCode,
  validatePan,
  validateMoq,
  validateMargin,
  validateBnplMaxDays,
  validateCategoryId,
  validateAnalyticsGroupBy,
  validateSearchQuery,
  validateTextarea,
} from '@supermandi/common';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function logPass(msg: string) {
  console.log(`${GREEN}[PASS]${NC} ${msg}`);
  passCount++;
}

function logFail(msg: string, error?: string) {
  console.log(`${RED}[FAIL]${NC} ${msg}${error ? ': ' + error : ''}`);
  failCount++;
}

function logInfo(msg: string) {
  console.log(`${YELLOW}[INFO]${NC} ${msg}`);
}

function test(name: string, fn: () => void) {
  try {
    fn();
    logPass(name);
  } catch (e: any) {
    logFail(name, e.message);
  }
}

function assertEqual(a: any, b: any) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

console.log('==========================================');
console.log('  Batch 3 Input Validation Testing');
console.log('  GO-LIVE-146 to GO-LIVE-165');
console.log('==========================================\n');

// =============================================================================
// GO-LIVE-146: SQL Injection Prevention (groupBy whitelist)
// =============================================================================
logInfo('GO-LIVE-146: SQL Injection Prevention');

test("Valid groupBy 'hour' returns 'hour'", () => {
  const result = validateAnalyticsGroupBy('hour');
  if (result !== 'hour') throw new Error(`Got ${result}`);
});

test("Valid groupBy 'day' returns 'day'", () => {
  const result = validateAnalyticsGroupBy('day');
  if (result !== 'day') throw new Error(`Got ${result}`);
});

test("SQL injection attempt returns default", () => {
  const result = validateAnalyticsGroupBy("hour; DROP TABLE users--");
  if (result !== 'hour') throw new Error(`Injection not blocked, got: ${result}`);
});

test("Invalid groupBy returns default", () => {
  const result = validateAnalyticsGroupBy('invalid_value');
  if (result !== 'hour') throw new Error(`Got ${result}`);
});

test("Empty groupBy returns default", () => {
  const result = validateAnalyticsGroupBy('');
  if (result !== 'hour') throw new Error(`Got ${result}`);
});

console.log('');

// =============================================================================
// GO-LIVE-147: XSS Sanitization
// =============================================================================
logInfo('GO-LIVE-147: XSS Sanitization');

test("sanitizeHtml escapes < and >", () => {
  const result = sanitizeHtml('<script>alert(1)</script>');
  if (result.includes('<') || result.includes('>')) {
    throw new Error(`XSS not sanitized: ${result}`);
  }
});

test("sanitizeHtml escapes quotes", () => {
  const result = sanitizeHtml('Test "quoted" \'single\'');
  if (result.includes('"') || result.includes("'")) {
    throw new Error(`Quotes not escaped: ${result}`);
  }
});

test("sanitizeHtml preserves normal text", () => {
  const result = sanitizeHtml('Normal Product Name');
  if (result !== 'Normal Product Name') throw new Error(`Got ${result}`);
});

test("sanitizeHtml handles empty string", () => {
  const result = sanitizeHtml('');
  if (result !== '') throw new Error(`Got ${result}`);
});

console.log('');

// =============================================================================
// GO-LIVE-148: Barcode Validation
// =============================================================================
logInfo('GO-LIVE-148: Barcode Validation');

test("Valid EAN-13 barcode accepted", () => {
  const result = validateBarcode('1234567890123');
  if (!result.valid) throw new Error(result.error);
});

test("Valid EAN-8 barcode accepted", () => {
  const result = validateBarcode('12345678');
  if (!result.valid) throw new Error(result.error);
});

test("Long barcode (DoS prevention) rejected", () => {
  const result = validateBarcode('A'.repeat(100));
  if (result.valid) throw new Error('Long barcode should be rejected');
});

test("Empty barcode allowed (optional field)", () => {
  const result = validateBarcode('');
  if (!result.valid) throw new Error(result.error);
});

test("Null barcode allowed", () => {
  const result = validateBarcode(null);
  if (!result.valid) throw new Error(result.error);
});

console.log('');

// =============================================================================
// GO-LIVE-149: Device Fingerprint Validation
// =============================================================================
logInfo('GO-LIVE-149: Device Fingerprint Validation');

test("Valid hex fingerprint accepted", () => {
  const result = validateDeviceFingerprint('abc123def456');
  if (!result.valid) throw new Error(result.error);
});

test("Fingerprint with dashes accepted", () => {
  const result = validateDeviceFingerprint('abc-123-def-456');
  if (!result.valid) throw new Error(result.error);
});

test("Binary/special chars rejected", () => {
  const result = validateDeviceFingerprint('xyz@#$%^&*');
  if (result.valid) throw new Error('Invalid chars should be rejected');
});

test("Long fingerprint (128+ chars) rejected", () => {
  const result = validateDeviceFingerprint('a'.repeat(200));
  if (result.valid) throw new Error('Long fingerprint should be rejected');
});

console.log('');

// =============================================================================
// GO-LIVE-151: Price Lower Bound Validation
// =============================================================================
logInfo('GO-LIVE-151: Price Lower Bound Validation');

test("Price 1 paise accepted", () => {
  const result = validatePrice(1);
  if (!result.valid) throw new Error(result.error);
});

test("Price 100 (1 INR) accepted", () => {
  const result = validatePrice(100);
  if (!result.valid) throw new Error(result.error);
});

test("Price 0 rejected", () => {
  const result = validatePrice(0);
  if (result.valid) throw new Error('Zero price should be rejected');
});

test("Negative price rejected", () => {
  const result = validatePrice(-100);
  if (result.valid) throw new Error('Negative price should be rejected');
});

console.log('');

// =============================================================================
// GO-LIVE-153: Email Validation
// =============================================================================
logInfo('GO-LIVE-153: Email Validation');

test("Valid email accepted", () => {
  const result = validateEmail('test@example.com');
  if (!result.valid) throw new Error(result.error);
});

test("Email with subdomain accepted", () => {
  const result = validateEmail('user@mail.example.co.in');
  if (!result.valid) throw new Error(result.error);
});

test("Invalid email rejected", () => {
  const result = validateEmail('not-an-email');
  if (result.valid) throw new Error('Invalid email should be rejected');
});

test("Email without TLD rejected", () => {
  const result = validateEmail('user@localhost');
  if (result.valid) throw new Error('Email without TLD should be rejected');
});

console.log('');

// =============================================================================
// GO-LIVE-154: Phone Validation
// =============================================================================
logInfo('GO-LIVE-154: Phone Validation');

test("Valid 10-digit phone accepted", () => {
  const result = validatePhone('9876543210');
  if (!result.valid) throw new Error(result.error);
});

test("Phone with +91 prefix accepted", () => {
  const result = validatePhone('+919876543210');
  if (!result.valid) throw new Error(result.error);
});

test("Short phone (5 digits) rejected", () => {
  const result = validatePhone('12345');
  if (result.valid) throw new Error('Short phone should be rejected');
});

test("Phone with letters rejected", () => {
  const result = validatePhone('98765ABCDE');
  if (result.valid) throw new Error('Phone with letters should be rejected');
});

console.log('');

// =============================================================================
// GO-LIVE-155: PIN Code Validation
// =============================================================================
logInfo('GO-LIVE-155: PIN Code Validation');

test("Valid 6-digit PIN accepted", () => {
  const result = validatePinCode('560001');
  if (!result.valid) throw new Error(result.error);
});

test("Non-numeric PIN rejected", () => {
  const result = validatePinCode('56000A');
  if (result.valid) throw new Error('Non-numeric PIN should be rejected');
});

test("5-digit PIN rejected", () => {
  const result = validatePinCode('56000');
  if (result.valid) throw new Error('5-digit PIN should be rejected');
});

test("7-digit PIN rejected", () => {
  const result = validatePinCode('5600001');
  if (result.valid) throw new Error('7-digit PIN should be rejected');
});

console.log('');

// =============================================================================
// GO-LIVE-156: PAN Validation
// =============================================================================
logInfo('GO-LIVE-156: PAN Validation');

test("Valid PAN accepted", () => {
  const result = validatePan('ABCDE1234F');
  if (!result.valid) throw new Error(result.error);
});

test("PAN with spaces trimmed and normalized", () => {
  const result = validatePan(' abcde1234f ');
  if (!result.valid) throw new Error(result.error);
  if (result.value !== 'ABCDE1234F') throw new Error(`Got ${result.value}`);
});

test("Invalid PAN format rejected", () => {
  const result = validatePan('INVALID123');
  if (result.valid) throw new Error('Invalid PAN should be rejected');
});

test("Too short PAN rejected", () => {
  const result = validatePan('ABC123');
  if (result.valid) throw new Error('Short PAN should be rejected');
});

console.log('');

// =============================================================================
// GO-LIVE-157: Textarea Max Length
// =============================================================================
logInfo('GO-LIVE-157: Textarea Max Length');

test("Short text accepted", () => {
  const result = validateTextarea('Short note', 500);
  if (!result.valid) throw new Error(result.error);
});

test("Text at max length accepted", () => {
  const result = validateTextarea('A'.repeat(500), 500);
  if (!result.valid) throw new Error(result.error);
});

test("Text exceeding max rejected", () => {
  const result = validateTextarea('A'.repeat(501), 500);
  if (result.valid) throw new Error('Long text should be rejected');
});

console.log('');

// =============================================================================
// GO-LIVE-158: Search Query Length
// =============================================================================
logInfo('GO-LIVE-158: Search Query Length');

test("Normal search query accepted", () => {
  const result = validateSearchQuery('product name');
  if (!result.valid) throw new Error(result.error);
});

test("Long search query (DoS prevention) rejected", () => {
  const result = validateSearchQuery('A'.repeat(300));
  if (result.valid) throw new Error('Long search should be rejected');
});

test("Search query with special chars sanitized", () => {
  const result = validateSearchQuery('test%');
  // Should be valid but sanitized
  if (!result.valid) throw new Error(result.error);
});

console.log('');

// =============================================================================
// GO-LIVE-162: Category ID Validation
// =============================================================================
logInfo('GO-LIVE-162: Category ID Validation');

test("Valid UUID category accepted", () => {
  const result = validateCategoryId('12345678-1234-1234-1234-123456789abc');
  if (!result.valid) throw new Error(result.error);
});

test("Invalid UUID rejected", () => {
  const result = validateCategoryId('not-a-uuid');
  if (result.valid) throw new Error('Invalid UUID should be rejected');
});

test("Empty category allowed (optional)", () => {
  const result = validateCategoryId('');
  if (!result.valid) throw new Error(result.error);
});

console.log('');

// =============================================================================
// GO-LIVE-163: MOQ Bounds Validation
// =============================================================================
logInfo('GO-LIVE-163: MOQ Bounds Validation');

test("MOQ 1 accepted", () => {
  const result = validateMoq(1);
  if (!result.valid) throw new Error(result.error);
});

test("MOQ 10000 accepted", () => {
  const result = validateMoq(10000);
  if (!result.valid) throw new Error(result.error);
});

test("MOQ 0 rejected", () => {
  const result = validateMoq(0);
  if (result.valid) throw new Error('Zero MOQ should be rejected');
});

test("MOQ 10001 rejected", () => {
  const result = validateMoq(10001);
  if (result.valid) throw new Error('MOQ > 10000 should be rejected');
});

test("Negative MOQ rejected", () => {
  const result = validateMoq(-5);
  if (result.valid) throw new Error('Negative MOQ should be rejected');
});

console.log('');

// =============================================================================
// GO-LIVE-164: Margin Validation
// =============================================================================
logInfo('GO-LIVE-164: Margin Validation');

test("Margin 0% accepted", () => {
  const result = validateMargin(0);
  if (!result.valid) throw new Error(result.error);
});

test("Margin 50% accepted", () => {
  const result = validateMargin(50);
  if (!result.valid) throw new Error(result.error);
});

test("Margin 100% accepted", () => {
  const result = validateMargin(100);
  if (!result.valid) throw new Error(result.error);
});

test("Margin -1% rejected", () => {
  const result = validateMargin(-1);
  if (result.valid) throw new Error('Negative margin should be rejected');
});

test("Margin 101% rejected", () => {
  const result = validateMargin(101);
  if (result.valid) throw new Error('Margin > 100% should be rejected');
});

console.log('');

// =============================================================================
// GO-LIVE-165: BNPL Max Days Validation
// =============================================================================
logInfo('GO-LIVE-165: BNPL Max Days Validation');

test("BNPL 1 day accepted", () => {
  const result = validateBnplMaxDays(1);
  if (!result.valid) throw new Error(result.error);
});

test("BNPL 30 days accepted", () => {
  const result = validateBnplMaxDays(30);
  if (!result.valid) throw new Error(result.error);
});

test("BNPL 365 days accepted", () => {
  const result = validateBnplMaxDays(365);
  if (!result.valid) throw new Error(result.error);
});

test("BNPL 0 days rejected", () => {
  const result = validateBnplMaxDays(0);
  if (result.valid) throw new Error('Zero days should be rejected');
});

test("BNPL 366 days rejected", () => {
  const result = validateBnplMaxDays(366);
  if (result.valid) throw new Error('Days > 365 should be rejected');
});

test("BNPL negative days rejected", () => {
  const result = validateBnplMaxDays(-30);
  if (result.valid) throw new Error('Negative days should be rejected');
});

console.log('');

// =============================================================================
// Final Results
// =============================================================================
console.log('==========================================');
console.log('  Final Results');
console.log('==========================================');
console.log(`${GREEN}Passed:${NC} ${passCount}`);
console.log(`${RED}Failed:${NC} ${failCount}`);
console.log('==========================================');

if (failCount > 0) {
  console.log(`\n${RED}Some tests failed!${NC}`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}All tests passed!${NC}`);
  process.exit(0);
}
