/**
 * STG-474: PAN/Aadhaar encrypted at rest
 * Source analysis tests: verify encrypt() is called before DB write, decrypt on read
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-474: PAN/Aadhaar encryption at rest', () => {
  const creditSource = readFileSync(
    join(__dirname, '..', 'src', 'routes', 'v1', 'pos', 'credit.ts'),
    'utf-8'
  );

  const adminCreditSource = readFileSync(
    join(__dirname, '..', 'src', 'routes', 'v1', 'admin', 'credit.ts'),
    'utf-8'
  );

  // =========================================================================
  // POS credit route — encryption on write
  // =========================================================================

  it('should import encrypt from encryption utility', () => {
    expect(creditSource).toContain("import { encrypt }");
    expect(creditSource).toContain("utils/encryption");
  });

  it('should encrypt PAN before storing', () => {
    // panNumber is uppercased before encryption: encrypt(panNumber.toUpperCase())
    expect(creditSource).toContain('encrypt(panNumber');
    // Encrypted value should be used in SQL, not raw panNumber
    const storeSection = creditSource.substring(creditSource.indexOf('STG-474: Encrypt PAN'));
    expect(storeSection).toContain('encryptedPan');
  });

  it('should encrypt Aadhaar before storing', () => {
    // effectiveAadhaarLast4 is the validated variable name used
    expect(creditSource).toContain('encrypt(effectiveAadhaarLast4)');
    const storeSection = creditSource.substring(creditSource.indexOf('STG-474: Encrypt PAN'));
    expect(storeSection).toContain('encryptedAadhaar');
  });

  it('should use encrypted values in SQL params, not raw values', () => {
    // Find the SQL UPDATE that stores PAN — params should be encryptedPan, not panNumber
    const updateIdx = creditSource.indexOf('encryptedPan, encryptedAadhaar');
    expect(updateIdx).toBeGreaterThan(-1);
  });

  // =========================================================================
  // Admin credit route — decryption on read
  // =========================================================================

  it('should import decrypt in admin credit route', () => {
    expect(adminCreditSource).toContain("import { decrypt }");
    expect(adminCreditSource).toContain("utils/encryption");
  });

  it('should decrypt PAN for admin display', () => {
    expect(adminCreditSource).toContain("decrypt(row.panNumber)");
  });

  it('should decrypt Aadhaar for admin display', () => {
    expect(adminCreditSource).toContain("decrypt(row.aadhaarLast4)");
  });

  it('should handle legacy plaintext data gracefully', () => {
    // Check for v1: prefix detection (only decrypt if encrypted)
    expect(adminCreditSource).toContain("startsWith('v1:')");
  });
});
