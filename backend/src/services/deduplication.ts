// DEDUP-001: Duplicate Prevention Service
// Checks for duplicate phone/GSTIN/UPI before registration
// Returns existing entity or flags potential duplicates for admin review

import { Pool } from "pg";

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  duplicateType?: "phone" | "gstin" | "upi";
  existingEntityId?: string;
  existingEntityName?: string;
  action: "block" | "flag" | "allow";
  message?: string;
}

export interface StoreDuplicateCheck {
  phone?: string;
  gstin?: string;
  upiVpa?: string;
}

/**
 * Check for duplicate phone number in stores
 * Phone duplicates BLOCK registration (hard constraint)
 */
export async function checkStorePhoneDuplicate(
  pool: Pool,
  phone: string,
  excludeStoreId?: string
): Promise<DuplicateCheckResult> {
  if (!phone) {
    return { hasDuplicate: false, action: "allow" };
  }

  // Normalize phone (remove spaces, ensure +91 format)
  const normalizedPhone = normalizePhone(phone);

  const query = excludeStoreId
    ? `SELECT id, name FROM platform.stores WHERE phone = $1 AND id != $2 LIMIT 1`
    : `SELECT id, name FROM platform.stores WHERE phone = $1 LIMIT 1`;

  const params = excludeStoreId
    ? [normalizedPhone, excludeStoreId]
    : [normalizedPhone];

  const result = await pool.query(query, params);

  if (result.rowCount && result.rowCount > 0) {
    return {
      hasDuplicate: true,
      duplicateType: "phone",
      existingEntityId: result.rows[0].id,
      existingEntityName: result.rows[0].name,
      action: "block",
      message: "A store with this phone number already exists",
    };
  }

  return { hasDuplicate: false, action: "allow" };
}

/**
 * Check for duplicate GSTIN in stores
 * GSTIN duplicates FLAG but don't block (different owners possible)
 */
export async function checkStoreGstinDuplicate(
  pool: Pool,
  gstin: string,
  excludeStoreId?: string
): Promise<DuplicateCheckResult> {
  if (!gstin) {
    return { hasDuplicate: false, action: "allow" };
  }

  // Normalize GSTIN (uppercase, trim)
  const normalizedGstin = gstin.trim().toUpperCase();

  // Check both gstin (new registration) and gst_number (legacy) columns
  const query = excludeStoreId
    ? `SELECT id, name FROM platform.stores WHERE (UPPER(gst_number) = $1 OR UPPER(gstin) = $1) AND id != $2 LIMIT 1`
    : `SELECT id, name FROM platform.stores WHERE (UPPER(gst_number) = $1 OR UPPER(gstin) = $1) LIMIT 1`;

  const params = excludeStoreId
    ? [normalizedGstin, excludeStoreId]
    : [normalizedGstin];

  const result = await pool.query(query, params);

  if (result.rowCount && result.rowCount > 0) {
    return {
      hasDuplicate: true,
      duplicateType: "gstin",
      existingEntityId: result.rows[0].id,
      existingEntityName: result.rows[0].name,
      action: "flag", // Flag but allow registration
      message: "Another store has the same GSTIN. This will be flagged for review.",
    };
  }

  return { hasDuplicate: false, action: "allow" };
}

/**
 * Check for duplicate UPI VPA in stores
 * UPI duplicates FLAG but don't block
 */
export async function checkStoreUpiDuplicate(
  pool: Pool,
  upiVpa: string,
  excludeStoreId?: string
): Promise<DuplicateCheckResult> {
  if (!upiVpa) {
    return { hasDuplicate: false, action: "allow" };
  }

  // Normalize UPI (lowercase, trim)
  const normalizedUpi = upiVpa.trim().toLowerCase();

  const query = excludeStoreId
    ? `SELECT id, name FROM platform.stores WHERE LOWER(upi_vpa) = $1 AND id != $2 LIMIT 1`
    : `SELECT id, name FROM platform.stores WHERE LOWER(upi_vpa) = $1 LIMIT 1`;

  const params = excludeStoreId
    ? [normalizedUpi, excludeStoreId]
    : [normalizedUpi];

  const result = await pool.query(query, params);

  if (result.rowCount && result.rowCount > 0) {
    return {
      hasDuplicate: true,
      duplicateType: "upi",
      existingEntityId: result.rows[0].id,
      existingEntityName: result.rows[0].name,
      action: "flag", // Flag but allow
      message: "Another store uses the same UPI address. This will be flagged for review.",
    };
  }

  return { hasDuplicate: false, action: "allow" };
}

/**
 * Create a duplicate flag entry for admin review
 */
export async function createDuplicateFlag(
  pool: Pool,
  entityType: "store" | "supplier",
  entityId: string,
  duplicateType: "phone" | "gstin" | "upi",
  duplicateValue: string,
  matchingEntityId?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO platform.duplicate_flags
     (entity_type, entity_id, duplicate_type, duplicate_value, matching_entity_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [entityType, entityId, duplicateType, duplicateValue, matchingEntityId || null]
  );

  console.log(`[DEDUP-001] Flagged ${duplicateType} duplicate for ${entityType} ${entityId}`);
}

/**
 * Run all duplicate checks for a store registration
 */
export async function checkStoreDuplicates(
  pool: Pool,
  data: StoreDuplicateCheck,
  excludeStoreId?: string
): Promise<{
  canProceed: boolean;
  blockingDuplicate?: DuplicateCheckResult;
  flaggedDuplicates: DuplicateCheckResult[];
}> {
  const flaggedDuplicates: DuplicateCheckResult[] = [];
  let blockingDuplicate: DuplicateCheckResult | undefined;

  // Check phone (blocking)
  if (data.phone) {
    const phoneCheck = await checkStorePhoneDuplicate(pool, data.phone, excludeStoreId);
    if (phoneCheck.hasDuplicate) {
      if (phoneCheck.action === "block") {
        blockingDuplicate = phoneCheck;
      } else {
        flaggedDuplicates.push(phoneCheck);
      }
    }
  }

  // Only continue if not blocked
  if (!blockingDuplicate) {
    // Check GSTIN (flagging)
    if (data.gstin) {
      const gstinCheck = await checkStoreGstinDuplicate(pool, data.gstin, excludeStoreId);
      if (gstinCheck.hasDuplicate) {
        flaggedDuplicates.push(gstinCheck);
      }
    }

    // Check UPI (flagging)
    if (data.upiVpa) {
      const upiCheck = await checkStoreUpiDuplicate(pool, data.upiVpa, excludeStoreId);
      if (upiCheck.hasDuplicate) {
        flaggedDuplicates.push(upiCheck);
      }
    }
  }

  return {
    canProceed: !blockingDuplicate,
    blockingDuplicate,
    flaggedDuplicates,
  };
}

/**
 * Normalize phone number to standard format
 */
function normalizePhone(phone: string): string {
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, "");

  // If starts with 0, replace with +91
  if (normalized.startsWith("0")) {
    normalized = "+91" + normalized.substring(1);
  }

  // If 10 digits, add +91
  if (normalized.length === 10 && /^\d+$/.test(normalized)) {
    normalized = "+91" + normalized;
  }

  // If starts with 91 but no +, add +
  if (normalized.startsWith("91") && !normalized.startsWith("+")) {
    normalized = "+" + normalized;
  }

  return normalized;
}

export default {
  checkStorePhoneDuplicate,
  checkStoreGstinDuplicate,
  checkStoreUpiDuplicate,
  checkStoreDuplicates,
  createDuplicateFlag,
};
