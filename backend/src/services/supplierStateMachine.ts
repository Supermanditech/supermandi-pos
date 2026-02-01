/**
 * Supplier State Machine Service - CORE-002
 *
 * Manages supplier lifecycle status transitions with validation.
 * Enforces valid transitions and maintains audit trail.
 *
 * States:
 * - KYC_SUBMITTED: Initial state, supplier registered with KYC
 * - ACTIVE: Approved and fully operational
 * - NEEDS_FIX: Admin rejected, needs resubmission
 * - SUSPENDED: Admin suspended the supplier
 */

import type { Pool } from "pg";
import { getPool } from "../db/client";

// =============================================================================
// TYPES
// =============================================================================

export const SupplierStatus = {
  KYC_SUBMITTED: "KYC_SUBMITTED",
  ACTIVE: "ACTIVE",
  NEEDS_FIX: "NEEDS_FIX",
  SUSPENDED: "SUSPENDED",
} as const;

export type SupplierStatusType =
  (typeof SupplierStatus)[keyof typeof SupplierStatus];

export interface SupplierStatusTransition {
  from: SupplierStatusType | null;
  to: SupplierStatusType;
  reason?: string;
  changedBy?: string;
  changedByType?: "system" | "admin" | "supplier";
}

export interface SupplierWithStatus {
  id: string;
  business_name: string;
  gstin: string;
  verification_status: SupplierStatusType;
  rejection_reason: string | null;
  status_updated_at: Date;
  primary_phone: string | null;
  primary_email: string | null;
}

export interface TransitionResult {
  success: boolean;
  supplier?: SupplierWithStatus;
  error?: string;
  previousStatus?: SupplierStatusType;
  newStatus?: SupplierStatusType;
}

// =============================================================================
// VALID TRANSITIONS MATRIX
// =============================================================================

/**
 * Valid state transitions map.
 * Key is current status, value is array of allowed next statuses.
 */
const VALID_TRANSITIONS: Record<SupplierStatusType, SupplierStatusType[]> = {
  KYC_SUBMITTED: ["ACTIVE", "NEEDS_FIX", "SUSPENDED"],
  ACTIVE: ["SUSPENDED"],
  NEEDS_FIX: ["KYC_SUBMITTED", "SUSPENDED"],
  SUSPENDED: ["ACTIVE"], // Admin can reactivate
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function requirePool(): Pool {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not initialized");
  }
  return pool;
}

/**
 * Check if a transition from one status to another is valid.
 */
export function isValidTransition(
  from: SupplierStatusType | null,
  to: SupplierStatusType
): boolean {
  if (from === null) {
    // Initial state - only KYC_SUBMITTED is allowed
    return to === SupplierStatus.KYC_SUBMITTED;
  }

  const allowedTransitions = VALID_TRANSITIONS[from];
  return allowedTransitions?.includes(to) ?? false;
}

/**
 * Get all valid transitions from a given status.
 */
export function getValidTransitions(
  from: SupplierStatusType
): SupplierStatusType[] {
  return VALID_TRANSITIONS[from] || [];
}

// =============================================================================
// DATABASE FUNCTIONS
// =============================================================================

/**
 * Get current supplier status.
 */
export async function getSupplierStatus(
  supplierId: string
): Promise<SupplierWithStatus | null> {
  const pool = requirePool();

  const result = await pool.query<SupplierWithStatus>(
    `SELECT
      id,
      business_name,
      gstin,
      verification_status,
      rejection_reason,
      COALESCE(status_updated_at, updated_at) as status_updated_at,
      primary_phone,
      primary_email
    FROM supplier.suppliers
    WHERE id = $1`,
    [supplierId]
  );

  return result.rows[0] || null;
}

/**
 * Transition a supplier to a new verification_status with validation.
 *
 * @param supplierId - The supplier ID
 * @param newStatus - Target status
 * @param options - Transition options (reason, who made the change)
 * @returns TransitionResult with success/error info
 */
export async function transitionSupplier(
  supplierId: string,
  newStatus: SupplierStatusType,
  options: {
    reason?: string;
    changedBy?: string;
    changedByType?: "system" | "admin" | "supplier";
    skipValidation?: boolean;
  } = {}
): Promise<TransitionResult> {
  const pool = requirePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get current supplier status with lock
    const currentResult = await client.query<SupplierWithStatus>(
      `SELECT
        id,
        business_name,
        gstin,
        verification_status,
        rejection_reason,
        COALESCE(status_updated_at, updated_at) as status_updated_at,
        primary_phone,
        primary_email
      FROM supplier.suppliers
      WHERE id = $1
      FOR UPDATE`,
      [supplierId]
    );

    if (currentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, error: "Supplier not found" };
    }

    const supplier = currentResult.rows[0];
    const currentStatus = supplier.verification_status as SupplierStatusType;

    // Skip validation if requested (for admin overrides)
    if (!options.skipValidation) {
      // Validate transition is allowed
      if (!isValidTransition(currentStatus, newStatus)) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: `Invalid transition from ${currentStatus} to ${newStatus}`,
          previousStatus: currentStatus,
        };
      }
    }

    // Perform the update
    const updateResult = await client.query<SupplierWithStatus>(
      `UPDATE supplier.suppliers
      SET
        verification_status = $2,
        rejection_reason = CASE WHEN $2 = 'NEEDS_FIX' THEN $3 ELSE rejection_reason END,
        status_updated_at = NOW(),
        status_updated_by = $4,
        verified_at = CASE WHEN $2 = 'ACTIVE' THEN NOW() ELSE verified_at END,
        verified_by_user_id = CASE WHEN $2 = 'ACTIVE' THEN $4 ELSE verified_by_user_id END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        business_name,
        gstin,
        verification_status,
        rejection_reason,
        status_updated_at,
        primary_phone,
        primary_email`,
      [supplierId, newStatus, options.reason || null, options.changedBy || null]
    );

    await client.query("COMMIT");

    return {
      success: true,
      supplier: updateResult.rows[0],
      previousStatus: currentStatus,
      newStatus,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get suppliers by verification_status for admin queues.
 */
export async function getSuppliersByStatus(
  status: SupplierStatusType | SupplierStatusType[],
  options: { limit?: number; offset?: number } = {}
): Promise<SupplierWithStatus[]> {
  const pool = requirePool();
  const statuses = Array.isArray(status) ? status : [status];

  const result = await pool.query<SupplierWithStatus>(
    `SELECT
      id,
      business_name,
      gstin,
      verification_status,
      rejection_reason,
      COALESCE(status_updated_at, updated_at) as status_updated_at,
      primary_phone,
      primary_email
    FROM supplier.suppliers
    WHERE verification_status = ANY($1)
    ORDER BY status_updated_at ASC
    LIMIT $2 OFFSET $3`,
    [statuses, options.limit || 50, options.offset || 0]
  );

  return result.rows;
}

/**
 * Get pending suppliers count for dashboard widgets.
 */
export async function getPendingSuppliersCount(): Promise<{
  kyc_submitted: number;
  needs_fix: number;
  total_pending: number;
}> {
  const pool = requirePool();

  const result = await pool.query<{
    kyc_submitted: string;
    needs_fix: string;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE verification_status = 'KYC_SUBMITTED') as kyc_submitted,
      COUNT(*) FILTER (WHERE verification_status = 'NEEDS_FIX') as needs_fix
    FROM supplier.suppliers
    WHERE verification_status IN ('KYC_SUBMITTED', 'NEEDS_FIX')`
  );

  const row = result.rows[0];
  const kycSubmitted = parseInt(row.kyc_submitted, 10);
  const needsFix = parseInt(row.needs_fix, 10);

  return {
    kyc_submitted: kycSubmitted,
    needs_fix: needsFix,
    total_pending: kycSubmitted + needsFix,
  };
}

/**
 * Get supplier status history from audit log.
 */
export async function getSupplierStatusHistory(
  supplierId: string,
  options: { limit?: number } = {}
): Promise<
  Array<{
    id: string;
    old_status: string | null;
    new_status: string;
    reason: string | null;
    changed_by: string | null;
    changed_by_type: string;
    changed_at: Date;
  }>
> {
  const pool = requirePool();

  const result = await pool.query(
    `SELECT
      id,
      old_status,
      new_status,
      reason,
      changed_by,
      changed_by_type,
      changed_at
    FROM supplier.supplier_status_audit
    WHERE supplier_id = $1
    ORDER BY changed_at DESC
    LIMIT $2`,
    [supplierId, options.limit || 20]
  );

  return result.rows;
}

// =============================================================================
// CONVENIENCE FUNCTIONS FOR COMMON TRANSITIONS
// =============================================================================

/**
 * Approve supplier (admin action).
 */
export async function approveSupplier(
  supplierId: string,
  adminId: string
): Promise<TransitionResult> {
  return transitionSupplier(supplierId, SupplierStatus.ACTIVE, {
    changedBy: adminId,
    changedByType: "admin",
  });
}

/**
 * Reject supplier with reason (admin action).
 */
export async function rejectSupplier(
  supplierId: string,
  adminId: string,
  reason: string
): Promise<TransitionResult> {
  return transitionSupplier(supplierId, SupplierStatus.NEEDS_FIX, {
    reason,
    changedBy: adminId,
    changedByType: "admin",
  });
}

/**
 * Suspend supplier (admin action).
 */
export async function suspendSupplier(
  supplierId: string,
  adminId: string,
  reason: string
): Promise<TransitionResult> {
  return transitionSupplier(supplierId, SupplierStatus.SUSPENDED, {
    reason,
    changedBy: adminId,
    changedByType: "admin",
  });
}

/**
 * Reactivate suspended supplier (admin action).
 */
export async function reactivateSupplier(
  supplierId: string,
  adminId: string
): Promise<TransitionResult> {
  return transitionSupplier(supplierId, SupplierStatus.ACTIVE, {
    reason: "Reactivated by admin",
    changedBy: adminId,
    changedByType: "admin",
    skipValidation: true, // Admin can override
  });
}

/**
 * Resubmit KYC after rejection (supplier action).
 */
export async function resubmitSupplierKYC(
  supplierId: string
): Promise<TransitionResult> {
  return transitionSupplier(supplierId, SupplierStatus.KYC_SUBMITTED, {
    reason: "KYC resubmitted",
    changedByType: "supplier",
  });
}
