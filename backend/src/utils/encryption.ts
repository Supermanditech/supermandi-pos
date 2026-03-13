/**
 * STG-486: Encryption key management utility
 *
 * Provides encrypt/decrypt functions using AES-256-GCM.
 * Key sourced from:
 *   - Production: GCP Secret Manager (ENCRYPTION_KEY_SECRET env var)
 *   - Dev/staging: ENCRYPTION_KEY env var (base64-encoded 32-byte key)
 *
 * Key caching: fetched once on first use, cached in memory.
 * Key rotation: new key version in Secret Manager, old ciphertexts
 *   include key version prefix for migration.
 */

import crypto from 'crypto';
import { createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'encryption', level: process.env.LOG_LEVEL || 'info' });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_VERSION_PREFIX = 'v1:'; // Prepended to ciphertext for rotation support

// Cached key buffer
let cachedKey: Buffer | null = null;

/**
 * Get the encryption key.
 * In production, reads from GCP Secret Manager via ENCRYPTION_KEY_SECRET.
 * In dev, reads ENCRYPTION_KEY env var directly.
 * Key must be 32 bytes (base64-encoded).
 */
async function getEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const secretName = process.env['ENCRYPTION_KEY_SECRET'];
  const directKey = process.env['ENCRYPTION_KEY'];

  if (secretName && process.env['NODE_ENV'] === 'production') {
    // Production: fetch from GCP Secret Manager (dynamic import — package may not be installed in dev)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SecretManagerServiceClient } = await import(/* webpackIgnore: true */ '@google-cloud/secret-manager' as string) as {
        SecretManagerServiceClient: new () => { accessSecretVersion: (req: { name: string }) => Promise<[{ payload?: { data?: string | Uint8Array } }]> };
      };
      const client = new SecretManagerServiceClient();
      const [version] = await client.accessSecretVersion({ name: secretName });
      const payload = version.payload?.data;
      if (!payload) throw new Error('Empty secret payload');
      const keyStr = typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf-8');
      cachedKey = Buffer.from(keyStr.trim(), 'base64');
    } catch (error) {
      logger.error('[Encryption] Failed to fetch key from Secret Manager', error instanceof Error ? error : undefined);
      throw new Error('Encryption key unavailable');
    }
  } else if (directKey) {
    // Dev/staging: use ENCRYPTION_KEY env var
    cachedKey = Buffer.from(directKey.trim(), 'base64');
  } else {
    throw new Error('No encryption key configured. Set ENCRYPTION_KEY (base64) or ENCRYPTION_KEY_SECRET (GCP Secret Manager path).');
  }

  const keyLength = cachedKey.length;
  if (keyLength !== 32) {
    cachedKey = null;
    throw new Error(`Encryption key must be 32 bytes (got ${keyLength}). Provide base64-encoded 256-bit key.`);
  }

  logger.info('[Encryption] Key loaded successfully');
  return cachedKey;
}

/**
 * Encrypt plaintext string.
 * Returns base64 string: "v1:<iv>:<authTag>:<ciphertext>"
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>
  return `${KEY_VERSION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt ciphertext string.
 * Expects format: "v1:<iv>:<authTag>:<ciphertext>" (all base64).
 */
export async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext.startsWith(KEY_VERSION_PREFIX)) {
    throw new Error('Unsupported ciphertext version');
  }

  const withoutPrefix = ciphertext.slice(KEY_VERSION_PREFIX.length);
  const parts = withoutPrefix.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivB64, authTagB64, encryptedB64] = parts;
  const iv = Buffer.from(ivB64!, 'base64');
  const authTag = Buffer.from(authTagB64!, 'base64');
  const encrypted = Buffer.from(encryptedB64!, 'base64');

  const key = await getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Clear the cached encryption key (for testing or key rotation).
 */
export function clearKeyCache(): void {
  cachedKey = null;
}

/**
 * Generate a new 32-byte encryption key (base64-encoded).
 * Utility for operators to create keys.
 */
export function generateKey(): string {
  return crypto.randomBytes(32).toString('base64');
}
