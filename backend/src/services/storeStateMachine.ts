/**
 * Store State Machine Service - CORE-001
 *
 * Manages store lifecycle status transitions with validation.
 * Enforces valid transitions and maintains audit trail.
 *
 * States:
 * - DRAFT: Initial state, store created but not enrolled
 * - ENROLLED: Device bound to store
 * - KYC_SUBMITTED: Documents uploaded
 * - PAYMENTS_SUBMITTED: UPI/bank details submitted, awaiting approval
 * - ACTIVE: Fully operational, admin approved
 * - NEEDS_FIX: Admin rejected, needs resubmission
 * - SUSPENDED: Admin suspended the store
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/client";

// =============================================================================
// TYPES
// =============================================================================

export const StoreStatus = {
  DRAFT: "DRAFT",
  ENROLLED: "ENROLLED",
  KYC_SUBMITTED: "KYC_SUBMITTED",
  PAYMENTS_SUBMITTED: "PAYMENTS_SUBMITTED",
  ACTIVE: "ACTIVE",
  NEEDS_FIX: "NEEDS_FIX",
  SUSPENDED: "SUSPENDED",
} as const;

export type StoreStatusType = (typeof StoreStatus)[keyof typeof StoreStatus];

export interface StoreStatusTransition {
  from: StoreStatusType | null;
  to: StoreStatusType;
  reason?: string;
  changedBy?: string;
  changedByType?: "system" | "admin" | "retailer";
}

export interface StoreReadinessFlags {
  device_bound: boolean;
  kyc_complete: boolean;
  upi_complete: boolean;
  admin_approved: boolean;
}

export interface StoreWithStatus {
  id: string;
  name: string;
  status: StoreStatusType;
  device_bound: boolean;
  kyc_complete: boolean;
  upi_complete: boolean;
  admin_approved: boolean;
  status_reason: string | null;
  status_updated_at: Date;
}

export interface TransitionResult {
  success: boolean;
  store?: StoreWithStatus;
  error?: string;
  previousStatus?: StoreStatusType;
  newStatus?: StoreStatusType;
}

// =============================================================================
// VALID TRANSITIONS MATRIX
// =============================================================================

/**
 * Valid state transitions map.
 * Key is current status, value is array of allowed next statuses.
 */
const VALID_TRANSITIONS: Record<StoreStatusType, StoreStatusType[]> = {
  DRAFT: ["ENROLLED", "SUSPENDED"],
  ENROLLED: ["KYC_SUBMITTED", "SUSPENDED"],
  KYC_SUBMITTED: ["PAYMENTS_SUBMITTED", "NEEDS_FIX", "SUSPENDED"],
  PAYMENTS_SUBMITTED: ["ACTIVE", "NEEDS_FIX", "SUSPENDED"],
  ACTIVE: ["SUSPENDED"],
  NEEDS_FIX: ["KYC_SUBMITTED", "PAYMENTS_SUBMITTED", "SUSPENDED"],
  SUSPENDED: ["ACTIVE", "DRAFT"], // Admin can reactivate or reset
};

/**
 * Requirements for transitioning TO a specific status.
 * Used for automatic validation.
 */
const TRANSITION_REQUIREMENTS: Partial<
  Record<StoreStatusType, (flags: StoreReadinessFlags) => boolean>
> = {
  ENROLLED: (flags) => flags.device_bound,
  ACTIVE: (flags) =>
    flags.device_bound &&
    flags.kyc_complete &&
    flags.upi_complete &&
    flags.admin_approved,
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
  from: StoreStatusType | null,
  to: StoreStatusType
): boolean {
  if (from === null) {
    // Initial state - only DRAFT is allowed
    return to === StoreStatus.DRAFT;
  }

  const allowedTransitions = VALID_TRANSITIONS[from];
  return allowedTransitions?.includes(to) ?? false;
}

/**
 * Get all valid transitions from a given status.
 */
export function getValidTransitions(from: StoreStatusType): StoreStatusType[] {
  return VALID_TRANSITIONS[from] || [];
}

/**
 * Check if flags meet requirements for a target status.
 */
export function meetsRequirements(
  to: StoreStatusType,
  flags: StoreReadinessFlags
): boolean {
  const checker = TRANSITION_REQUIREMENTS[to];
  if (!checker) {
    return true; // No specific requirements
  }
  return checker(flags);
}

/**
 * Get missing requirements for a target status.
 */
export function getMissingRequirements(
  to: StoreStatusType,
  flags: StoreReadinessFlags
): string[] {
  const missing: string[] = [];

  if (to === StoreStatus.ENROLLED && !flags.device_bound) {
    missing.push("Device must be bound");
  }

  if (to === StoreStatus.ACTIVE) {
    if (!flags.device_bound) missing.push("Device must be bound");
    if (!flags.kyc_complete) missing.push("KYC must be complete");
    if (!flags.upi_complete) missing.push("UPI must be set up");
    if (!flags.admin_approved) missing.push("Admin must approve");
  }

  return missing;
}

// =============================================================================
// DATABASE FUNCTIONS
// =============================================================================

/**
 * Get current store status and flags.
 */
export async function getStoreStatus(storeId: string): Promise<StoreWithStatus | null> {
  const pool = requirePool();

  const result = await pool.query<StoreWithStatus>(
    `SELECT
      id,
      name,
      status,
      COALESCE(device_bound, false) as device_bound,
      COALESCE(kyc_complete, false) as kyc_complete,
      COALESCE(upi_complete, false) as upi_complete,
      COALESCE(admin_approved, false) as admin_approved,
      status_reason,
      COALESCE(status_updated_at, created_at) as status_updated_at
    FROM platform.stores
    WHERE id = $1 AND status != 'deleted'`,
    [storeId]
  );

  return result.rows[0] || null;
}

/**
 * Transition a store to a new status with validation.
 *
 * @param storeId - The store ID
 * @param newStatus - Target status
 * @param options - Transition options (reason, who made the change)
 * @returns TransitionResult with success/error info
 */
export async function transitionStore(
  storeId: string,
  newStatus: StoreStatusType,
  options: {
    reason?: string;
    changedBy?: string;
    changedByType?: "system" | "admin" | "retailer";
    skipValidation?: boolean;
  } = {}
): Promise<TransitionResult> {
  const pool = requirePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get current store status with lock
    const currentResult = await client.query<StoreWithStatus>(
      `SELECT
        id,
        name,
        status,
        COALESCE(device_bound, false) as device_bound,
        COALESCE(kyc_complete, false) as kyc_complete,
        COALESCE(upi_complete, false) as upi_complete,
        COALESCE(admin_approved, false) as admin_approved,
        status_reason,
        COALESCE(status_updated_at, created_at) as status_updated_at
      FROM platform.stores
      WHERE id = $1 AND status != 'deleted'
      FOR UPDATE`,
      [storeId]
    );

    if (currentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, error: "Store not found" };
    }

    const store = currentResult.rows[0];
    const currentStatus = store.status as StoreStatusType;

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

      // Check requirements for target status
      const flags: StoreReadinessFlags = {
        device_bound: store.device_bound,
        kyc_complete: store.kyc_complete,
        upi_complete: store.upi_complete,
        admin_approved: store.admin_approved || newStatus === StoreStatus.ACTIVE,
      };

      const missing = getMissingRequirements(newStatus, flags);
      if (missing.length > 0) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: `Requirements not met: ${missing.join(", ")}`,
          previousStatus: currentStatus,
        };
      }
    }

    // Perform the update
    const updateResult = await client.query<StoreWithStatus>(
      `UPDATE platform.stores
      SET
        status = $2,
        status_reason = $3,
        status_updated_at = NOW(),
        status_updated_by = $4,
        admin_approved = CASE WHEN $2 = 'ACTIVE' THEN true ELSE admin_approved END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        name,
        status,
        device_bound,
        kyc_complete,
        upi_complete,
        admin_approved,
        status_reason,
        status_updated_at`,
      [storeId, newStatus, options.reason || null, options.changedBy || null]
    );

    await client.query("COMMIT");

    return {
      success: true,
      store: updateResult.rows[0],
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
 * Update store readiness flags.
 * Used when device is bound, KYC is completed, etc.
 */
export async function updateStoreFlags(
  storeId: string,
  flags: Partial<StoreReadinessFlags>
): Promise<StoreWithStatus | null> {
  const pool = requirePool();

  const setClauses: string[] = [];
  const values: (string | boolean)[] = [storeId];
  let paramIndex = 2;

  if (flags.device_bound !== undefined) {
    setClauses.push(`device_bound = $${paramIndex++}`);
    values.push(flags.device_bound);
  }
  if (flags.kyc_complete !== undefined) {
    setClauses.push(`kyc_complete = $${paramIndex++}`);
    values.push(flags.kyc_complete);
  }
  if (flags.upi_complete !== undefined) {
    setClauses.push(`upi_complete = $${paramIndex++}`);
    values.push(flags.upi_complete);
  }
  if (flags.admin_approved !== undefined) {
    setClauses.push(`admin_approved = $${paramIndex++}`);
    values.push(flags.admin_approved);
  }

  if (setClauses.length === 0) {
    return getStoreStatus(storeId);
  }

  setClauses.push("updated_at = NOW()");

  const result = await pool.query<StoreWithStatus>(
    `UPDATE platform.stores
    SET ${setClauses.join(", ")}
    WHERE id = $1 AND status != 'deleted'
    RETURNING
      id,
      name,
      status,
      device_bound,
      kyc_complete,
      upi_complete,
      admin_approved,
      status_reason,
      status_updated_at`,
    values
  );

  return result.rows[0] || null;
}

/**
 * Get stores by status for admin queues.
 */
export async function getStoresByStatus(
  status: StoreStatusType | StoreStatusType[],
  options: { limit?: number; offset?: number } = {}
): Promise<StoreWithStatus[]> {
  const pool = requirePool();
  const statuses = Array.isArray(status) ? status : [status];

  const result = await pool.query<StoreWithStatus>(
    `SELECT
      id,
      name,
      status,
      COALESCE(device_bound, false) as device_bound,
      COALESCE(kyc_complete, false) as kyc_complete,
      COALESCE(upi_complete, false) as upi_complete,
      COALESCE(admin_approved, false) as admin_approved,
      status_reason,
      COALESCE(status_updated_at, created_at) as status_updated_at
    FROM platform.stores
    WHERE status = ANY($1) AND status != 'deleted'
    ORDER BY status_updated_at ASC
    LIMIT $2 OFFSET $3`,
    [statuses, options.limit || 50, options.offset || 0]
  );

  return result.rows;
}

/**
 * Get pending stores count for dashboard widgets.
 */
export async function getPendingStoresCount(): Promise<{
  payments_submitted: number;
  needs_fix: number;
  total_pending: number;
}> {
  const pool = requirePool();

  const result = await pool.query<{
    payments_submitted: string;
    needs_fix: string;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'PAYMENTS_SUBMITTED') as payments_submitted,
      COUNT(*) FILTER (WHERE status = 'NEEDS_FIX') as needs_fix
    FROM platform.stores
    WHERE status IN ('PAYMENTS_SUBMITTED', 'NEEDS_FIX')`
  );

  const row = result.rows[0];
  const paymentsSubmitted = parseInt(row.payments_submitted, 10);
  const needsFix = parseInt(row.needs_fix, 10);

  return {
    payments_submitted: paymentsSubmitted,
    needs_fix: needsFix,
    total_pending: paymentsSubmitted + needsFix,
  };
}

/**
 * Get store status history from audit log.
 */
export async function getStoreStatusHistory(
  storeId: string,
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
    FROM platform.store_status_audit
    WHERE store_id = $1
    ORDER BY changed_at DESC
    LIMIT $2`,
    [storeId, options.limit || 20]
  );

  return result.rows;
}

// =============================================================================
// CONVENIENCE FUNCTIONS FOR COMMON TRANSITIONS
// =============================================================================

/**
 * Mark store as enrolled (device bound).
 */
export async function enrollStore(
  storeId: string,
  changedBy?: string
): Promise<TransitionResult> {
  // First update the device_bound flag
  await updateStoreFlags(storeId, { device_bound: true });

  // Then transition
  return transitionStore(storeId, StoreStatus.ENROLLED, {
    changedBy,
    changedByType: "system",
  });
}

/**
 * Mark store as KYC submitted.
 */
export async function submitKYC(
  storeId: string,
  changedBy?: string
): Promise<TransitionResult> {
  await updateStoreFlags(storeId, { kyc_complete: true });

  return transitionStore(storeId, StoreStatus.KYC_SUBMITTED, {
    changedBy,
    changedByType: "retailer",
  });
}

/**
 * Mark store as payments submitted.
 */
export async function submitPayments(
  storeId: string,
  changedBy?: string
): Promise<TransitionResult> {
  await updateStoreFlags(storeId, { upi_complete: true });

  return transitionStore(storeId, StoreStatus.PAYMENTS_SUBMITTED, {
    changedBy,
    changedByType: "retailer",
  });
}

/**
 * Approve store (admin action).
 */
export async function approveStore(
  storeId: string,
  adminId: string
): Promise<TransitionResult> {
  await updateStoreFlags(storeId, { admin_approved: true });

  return transitionStore(storeId, StoreStatus.ACTIVE, {
    changedBy: adminId,
    changedByType: "admin",
  });
}

/**
 * Reject store with reason (admin action).
 */
export async function rejectStore(
  storeId: string,
  adminId: string,
  reason: string
): Promise<TransitionResult> {
  return transitionStore(storeId, StoreStatus.NEEDS_FIX, {
    reason,
    changedBy: adminId,
    changedByType: "admin",
  });
}

/**
 * Suspend store (admin action).
 */
export async function suspendStore(
  storeId: string,
  adminId: string,
  reason: string
): Promise<TransitionResult> {
  return transitionStore(storeId, StoreStatus.SUSPENDED, {
    reason,
    changedBy: adminId,
    changedByType: "admin",
  });
}

/**
 * Reactivate suspended store (admin action).
 */
export async function reactivateStore(
  storeId: string,
  adminId: string
): Promise<TransitionResult> {
  return transitionStore(storeId, StoreStatus.ACTIVE, {
    reason: "Reactivated by admin",
    changedBy: adminId,
    changedByType: "admin",
    skipValidation: true, // Admin can override
  });
}
