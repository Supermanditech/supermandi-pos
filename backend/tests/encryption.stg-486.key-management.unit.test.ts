/**
 * STG-486: Encryption key management utility tests
 * Tests: encrypt/decrypt round-trip, wrong key fails, key caching, format validation
 */

import crypto from 'crypto';

// Set a test key before importing the module
const TEST_KEY = crypto.randomBytes(32).toString('base64');
process.env['ENCRYPTION_KEY'] = TEST_KEY;

import { encrypt, decrypt, clearKeyCache, generateKey } from '../src/utils/encryption';

describe('STG-486: Encryption key management', () => {
  beforeEach(() => {
    clearKeyCache();
    process.env['ENCRYPTION_KEY'] = TEST_KEY;
    delete process.env['NODE_ENV'];
  });

  afterAll(() => {
    clearKeyCache();
  });

  it('should encrypt and decrypt round-trip correctly', async () => {
    const plaintext = 'ABCDE1234F'; // PAN format
    const ciphertext = await encrypt(plaintext);
    const decrypted = await decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for same plaintext (random IV)', async () => {
    const plaintext = 'test-data-123';
    const c1 = await encrypt(plaintext);
    const c2 = await encrypt(plaintext);
    expect(c1).not.toBe(c2);
    // But both decrypt to same
    expect(await decrypt(c1)).toBe(plaintext);
    expect(await decrypt(c2)).toBe(plaintext);
  });

  it('should prefix ciphertext with version marker', async () => {
    const ciphertext = await encrypt('hello');
    expect(ciphertext.startsWith('v1:')).toBe(true);
  });

  it('should fail to decrypt with wrong key', async () => {
    const ciphertext = await encrypt('sensitive data');

    // Switch to different key
    clearKeyCache();
    process.env['ENCRYPTION_KEY'] = crypto.randomBytes(32).toString('base64');

    await expect(decrypt(ciphertext)).rejects.toThrow();
  });

  it('should reject unsupported ciphertext version', async () => {
    await expect(decrypt('v2:abc:def:ghi')).rejects.toThrow('Unsupported ciphertext version');
  });

  it('should reject invalid ciphertext format', async () => {
    await expect(decrypt('v1:only-one-part')).rejects.toThrow('Invalid ciphertext format');
  });

  it('should throw if no key is configured', async () => {
    clearKeyCache();
    delete process.env['ENCRYPTION_KEY'];
    delete process.env['ENCRYPTION_KEY_SECRET'];

    await expect(encrypt('test')).rejects.toThrow('No encryption key configured');
  });

  it('should generate a valid 32-byte key', () => {
    const key = generateKey();
    const buf = Buffer.from(key, 'base64');
    expect(buf.length).toBe(32);
  });

  it('should handle empty string encryption', async () => {
    const ciphertext = await encrypt('');
    const decrypted = await decrypt(ciphertext);
    expect(decrypted).toBe('');
  });

  it('should handle Unicode text', async () => {
    const unicode = 'हिंदी टेक्स्ट 日本語';
    const ciphertext = await encrypt(unicode);
    const decrypted = await decrypt(ciphertext);
    expect(decrypted).toBe(unicode);
  });
});
