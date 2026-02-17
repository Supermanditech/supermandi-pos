/**
 * DRX-003: Enrollment Code Service
 *
 * Reusable enrollment code generation for device enrollment.
 * Used by:
 *   - Admin device enrollment endpoint (existing)
 *   - Registration → Enrollment bridge (new: auto-generate for POS registrations)
 *   - Admin "Send Enrollment Code" action
 */

import { randomBytes } from "crypto";
import { getPool } from "../db/client";
import { isDemoStoreCode } from "./storeCodeService";
import { log } from "../lib/logger";

// =============================================================================
// CONSTANTS
// =============================================================================

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ENROLLMENT_TTL_MINUTES = 30;
const DEMO_MAX_USES = 9999;
const PRODUCTION_MAX_USES = 1;

// =============================================================================
// CODE GENERATION
// =============================================================================

function generateCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    const idx = bytes[i] % CODE_ALPHABET.length;
    code += CODE_ALPHABET[idx];
  }
  return `SM-${code}`;
}

/**
 * Generate a unique enrollment code (collision-safe).
 */
export async function generateUniqueEnrollmentCode(): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("database unavailable");

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const exists = await pool.query(
      `SELECT 1 FROM pos_device_enrollments WHERE code = $1`,
      [code]
    );
    if (exists.rowCount === 0) {
      return code;
    }
  }
  // Fallback: hex-based code (extremely unlikely collision)
  return `SM-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export interface CreateEnrollmentCodeResult {
  code: string;
  expiresAt: string;
  maxUses: number;
  isDemo: boolean;
  qrPayload: string;
}

/**
 * Create an enrollment code for a store.
 *
 * @param storeId - The store UUID
 * @param storeCode - The store code (to determine demo vs production)
 * @param createdBy - Who created this code ("system", "superadmin", etc.)
 */
export async function createEnrollmentCode(
  storeId: string,
  storeCode: string,
  createdBy: string = "system"
): Promise<CreateEnrollmentCodeResult> {
  const pool = getPool();
  if (!pool) throw new Error("database unavailable");

  const isDemo = isDemoStoreCode(storeCode);
  const maxUses = isDemo ? DEMO_MAX_USES : PRODUCTION_MAX_USES;
  const expiresAt = isDemo
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + ENROLLMENT_TTL_MINUTES * 60_000).toISOString();

  const code = await generateUniqueEnrollmentCode();

  await pool.query(
    `INSERT INTO pos_device_enrollments (code, store_id, expires_at, max_uses, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [code, storeId, expiresAt, maxUses, createdBy]
  );

  log.info(
    `[EnrollmentCode] Created code=${code} store=${storeCode} isDemo=${isDemo} createdBy=${createdBy}`
  );

  return {
    code,
    expiresAt,
    maxUses,
    isDemo,
    qrPayload: `supermandi://enroll?code=${encodeURIComponent(code)}`,
  };
}
