/**
 * V3-FIX-187: Supplier allocation orchestration state machine
 *
 * Lifecycle: pending_trigger → triggered → accepted/partial_accepted/rejected
 *            → dispatched → delivered → grn_completed
 *
 * State transitions are enforced — invalid transitions throw.
 * Every transition writes to supplier_demand_allocations + lifecycle_event_log.
 */

import { Pool } from "pg";
import { getPool } from "../db/client";
import { log } from "../lib/logger";
import type { AllocationStatus, LifecycleEventType } from "./storeDemandSignal";

/** Valid state transitions */
const VALID_TRANSITIONS: Record<AllocationStatus, AllocationStatus[]> = {
  pending_trigger: ["triggered"],
  triggered: ["accepted", "partial_accepted", "rejected"],
  accepted: ["dispatched"],
  partial_accepted: ["dispatched"],
  rejected: [], // terminal
  dispatched: ["delivered"],
  delivered: ["grn_completed"],
  grn_completed: [], // terminal
};

/** Map allocation transition → lifecycle event */
const TRANSITION_EVENTS: Record<string, LifecycleEventType> = {
  "pending_trigger→triggered": "supplier_action_required",
  "triggered→accepted": "supplier_accepted",
  "triggered→partial_accepted": "partial_accept",
  "triggered→rejected": "supplier_rejected",
  "accepted→dispatched": "dispatched",
  "partial_accepted→dispatched": "dispatched",
  "dispatched→delivered": "delivered",
  "delivered→grn_completed": "grn_completed",
};

export interface AllocationRecord {
  id: string;
  retailerOrderId: string;
  supplierId: string;
  storeId: string;
  status: AllocationStatus;
  triggeredAt: string | null;
  acceptedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AllocationTransitionResult {
  allocation: AllocationRecord;
  eventId: string;
  previousStatus: AllocationStatus;
  newStatus: AllocationStatus;
}

/**
 * Validate that a state transition is legal.
 */
export function isValidTransition(from: AllocationStatus, to: AllocationStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get allowed next states from current status.
 */
export function getAllowedTransitions(status: AllocationStatus): AllocationStatus[] {
  return VALID_TRANSITIONS[status] ?? [];
}

/**
 * Create a new allocation for a retailer order → supplier.
 */
export async function createAllocation(
  retailerOrderId: string,
  supplierId: string,
  storeId: string
): Promise<AllocationRecord> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  const result = await pool.query<AllocationRecord>(
    `INSERT INTO public.supplier_demand_allocations
      (retailer_order_id, supplier_id, store_id, status)
     VALUES ($1, $2, $3, 'pending_trigger')
     RETURNING
       id, retailer_order_id AS "retailerOrderId", supplier_id AS "supplierId",
       store_id AS "storeId", status,
       triggered_at AS "triggeredAt", accepted_at AS "acceptedAt",
       dispatched_at AS "dispatchedAt", delivered_at AS "deliveredAt",
       created_at AS "createdAt", updated_at AS "updatedAt"`,
    [retailerOrderId, supplierId, storeId]
  );

  // Write lifecycle event
  await writeLifecycleEvent(pool, "order_created", retailerOrderId, storeId, supplierId, {
    allocationId: result.rows[0].id,
  });

  return result.rows[0];
}

/**
 * Transition an allocation to a new status.
 * Validates the transition, updates timestamps, writes lifecycle event.
 */
export async function transitionAllocation(
  allocationId: string,
  newStatus: AllocationStatus,
  actorId: string,
  payload?: Record<string, unknown>
): Promise<AllocationTransitionResult> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  // Lock and read current state
  const current = await pool.query<AllocationRecord>(
    `SELECT
       id, retailer_order_id AS "retailerOrderId", supplier_id AS "supplierId",
       store_id AS "storeId", status,
       triggered_at AS "triggeredAt", accepted_at AS "acceptedAt",
       dispatched_at AS "dispatchedAt", delivered_at AS "deliveredAt",
       created_at AS "createdAt", updated_at AS "updatedAt"
     FROM public.supplier_demand_allocations
     WHERE id = $1
     FOR UPDATE`,
    [allocationId]
  );

  if (current.rows.length === 0) {
    throw new Error(`Allocation ${allocationId} not found`);
  }

  const record = current.rows[0];
  const previousStatus = record.status;

  if (!isValidTransition(previousStatus, newStatus)) {
    throw new Error(
      `Invalid transition: ${previousStatus} → ${newStatus}. ` +
      `Allowed: ${getAllowedTransitions(previousStatus).join(", ") || "none (terminal)"}`
    );
  }

  // Build timestamp updates
  const timestampCol =
    newStatus === "triggered" ? "triggered_at" :
    newStatus === "accepted" || newStatus === "partial_accepted" ? "accepted_at" :
    newStatus === "dispatched" ? "dispatched_at" :
    newStatus === "delivered" ? "delivered_at" :
    null;

  const timestampClause = timestampCol ? `, ${timestampCol} = NOW()` : "";

  const updated = await pool.query<AllocationRecord>(
    `UPDATE public.supplier_demand_allocations
     SET status = $1, updated_at = NOW() ${timestampClause}
     WHERE id = $2
     RETURNING
       id, retailer_order_id AS "retailerOrderId", supplier_id AS "supplierId",
       store_id AS "storeId", status,
       triggered_at AS "triggeredAt", accepted_at AS "acceptedAt",
       dispatched_at AS "dispatchedAt", delivered_at AS "deliveredAt",
       created_at AS "createdAt", updated_at AS "updatedAt"`,
    [newStatus, allocationId]
  );

  // Also update purchase_orders.allocation_status for quick lookup
  await pool.query(
    `UPDATE orders.purchase_orders SET allocation_status = $1
     WHERE id = $2`,
    [newStatus, record.retailerOrderId]
  ).catch(() => { /* column may not exist yet — non-blocking */ });

  // Write lifecycle event
  const transitionKey = `${previousStatus}→${newStatus}`;
  const eventType = TRANSITION_EVENTS[transitionKey];
  let eventId = "";
  if (eventType) {
    eventId = await writeLifecycleEvent(
      pool, eventType,
      record.retailerOrderId, record.storeId, record.supplierId,
      { allocationId, actorId, previousStatus, newStatus, ...payload }
    );
  }

  log.info("allocation:transition",
    `${allocationId}: ${previousStatus} → ${newStatus} by ${actorId}`);

  return {
    allocation: updated.rows[0],
    eventId,
    previousStatus,
    newStatus,
  };
}

/**
 * Get allocation by ID.
 */
export async function getAllocation(allocationId: string): Promise<AllocationRecord | null> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  const result = await pool.query<AllocationRecord>(
    `SELECT
       id, retailer_order_id AS "retailerOrderId", supplier_id AS "supplierId",
       store_id AS "storeId", status,
       triggered_at AS "triggeredAt", accepted_at AS "acceptedAt",
       dispatched_at AS "dispatchedAt", delivered_at AS "deliveredAt",
       created_at AS "createdAt", updated_at AS "updatedAt"
     FROM public.supplier_demand_allocations
     WHERE id = $1`,
    [allocationId]
  );

  return result.rows[0] ?? null;
}

/**
 * List allocations for a supplier.
 */
export async function listSupplierAllocations(
  supplierId: string,
  options: { status?: AllocationStatus; limit?: number; offset?: number } = {}
): Promise<{ allocations: AllocationRecord[]; total: number }> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  const limit = Math.min(options.limit ?? 20, 100);
  const offset = options.offset ?? 0;

  let whereClause = "WHERE supplier_id = $1";
  const params: (string | number)[] = [supplierId];
  if (options.status) {
    params.push(options.status);
    whereClause += ` AND status = $${params.length}`;
  }

  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM public.supplier_demand_allocations ${whereClause}`,
    params
  );

  params.push(limit, offset);
  const result = await pool.query<AllocationRecord>(
    `SELECT
       id, retailer_order_id AS "retailerOrderId", supplier_id AS "supplierId",
       store_id AS "storeId", status,
       triggered_at AS "triggeredAt", accepted_at AS "acceptedAt",
       dispatched_at AS "dispatchedAt", delivered_at AS "deliveredAt",
       created_at AS "createdAt", updated_at AS "updatedAt"
     FROM public.supplier_demand_allocations
     ${whereClause}
     ORDER BY updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    allocations: result.rows,
    total: parseInt(countResult.rows[0]?.total ?? "0", 10),
  };
}

/**
 * List allocations for a store (retailer view).
 */
export async function listStoreAllocations(
  storeId: string,
  options: { status?: AllocationStatus; limit?: number; offset?: number } = {}
): Promise<{ allocations: AllocationRecord[]; total: number }> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  const limit = Math.min(options.limit ?? 20, 100);
  const offset = options.offset ?? 0;

  let whereClause = "WHERE store_id = $1";
  const params: (string | number)[] = [storeId];
  if (options.status) {
    params.push(options.status);
    whereClause += ` AND status = $${params.length}`;
  }

  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM public.supplier_demand_allocations ${whereClause}`,
    params
  );

  params.push(limit, offset);
  const result = await pool.query<AllocationRecord>(
    `SELECT
       id, retailer_order_id AS "retailerOrderId", supplier_id AS "supplierId",
       store_id AS "storeId", status,
       triggered_at AS "triggeredAt", accepted_at AS "acceptedAt",
       dispatched_at AS "dispatchedAt", delivered_at AS "deliveredAt",
       created_at AS "createdAt", updated_at AS "updatedAt"
     FROM public.supplier_demand_allocations
     ${whereClause}
     ORDER BY updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    allocations: result.rows,
    total: parseInt(countResult.rows[0]?.total ?? "0", 10),
  };
}

/**
 * Admin: cross-store allocation dashboard.
 */
export async function getAllocationSummary(): Promise<{
  total: number;
  byStatus: Record<string, number>;
}> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  const result = await pool.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::int AS count
     FROM public.supplier_demand_allocations
     GROUP BY status`
  );

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of result.rows) {
    byStatus[row.status] = parseInt(row.count, 10);
    total += parseInt(row.count, 10);
  }

  return { total, byStatus };
}

// ─── Internal helpers ───

async function writeLifecycleEvent(
  pool: Pool,
  eventType: LifecycleEventType,
  orderId: string,
  storeId: string,
  supplierId: string | null,
  payload: Record<string, unknown>
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.lifecycle_event_log
      (event_type, order_id, store_id, supplier_id, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [eventType, orderId, storeId, supplierId, JSON.stringify(payload)]
  );
  return result.rows[0].id;
}
