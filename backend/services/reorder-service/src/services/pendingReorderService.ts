// Pending Reorder Service - V3.0.9 compliant
// Manages pending reorders: list, approve, dismiss

import { getClient, ApiError, generateUUID } from '@supermandi/common';
import {
  getPendingReorderById,
  listPendingReorders,
  getPendingReordersByIds,
  updatePendingReorderStatus,
  bulkUpdatePendingReorderStatus,
  insertEventOutbox,
  type PendingReorder,
  type PendingReorderStatus,
} from '../db/queries';
import { config } from '../config';

// =============================================================================
// TYPES
// =============================================================================

export interface ListPendingOptions {
  status?: PendingReorderStatus;
  limit?: number;
  offset?: number;
}

export interface ApproveResult {
  approvedCount: number;
  draftPurchaseOrders: DraftPurchaseOrder[];
}

export interface DraftPurchaseOrder {
  supplierId: string;
  supplierName: string;
  items: DraftPurchaseOrderItem[];
  totalAmount: number;
}

export interface DraftPurchaseOrderItem {
  pendingReorderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  supplierProductId: string | null;
}

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Get a pending reorder by ID.
 */
export async function getPendingById(
  pendingId: string
): Promise<PendingReorder | null> {
  return getPendingReorderById(pendingId);
}

/**
 * List pending reorders for a store.
 */
export async function listPending(
  storeId: string,
  options: ListPendingOptions = {}
): Promise<{ pendingReorders: PendingReorder[]; total: number }> {
  const { status = 'pending', limit = config.reorder.defaultLimit, offset = 0 } = options;

  // Enforce max limit
  const effectiveLimit = Math.min(limit, config.reorder.maxLimit);

  return listPendingReorders(storeId, {
    status,
    limit: effectiveLimit,
    offset,
  });
}

/**
 * Approve selected pending reorders.
 * Groups by supplier and creates draft POs.
 *
 * Note: This service prepares the data for draft POs.
 * The actual PO creation is done by calling order-service.
 */
export async function approvePendingReorders(
  storeId: string,
  pendingIds: string[]
): Promise<ApproveResult> {
  if (pendingIds.length === 0) {
    throw new ApiError(400, 'INVALID_INPUT', 'At least one pending reorder ID is required');
  }

  // Fetch all pending reorders
  const pendingReorders = await getPendingReordersByIds(pendingIds);

  // Validate all belong to the store and are pending
  const invalid = pendingReorders.filter(
    (p) => p.storeId !== storeId || p.status !== 'pending'
  );
  if (invalid.length > 0) {
    throw new ApiError(
      400,
      'INVALID_PENDING_REORDERS',
      `Some pending reorders are invalid or not in pending status`
    );
  }

  // Check if any IDs were not found
  const foundIds = new Set(pendingReorders.map((p) => p.id));
  const notFoundIds = pendingIds.filter((id) => !foundIds.has(id));
  if (notFoundIds.length > 0) {
    throw new ApiError(
      404,
      'PENDING_REORDERS_NOT_FOUND',
      `Pending reorders not found: ${notFoundIds.join(', ')}`
    );
  }

  // Group by supplier
  const supplierGroups = groupBySupplierId(pendingReorders);

  // Create draft POs data (grouped by supplier)
  const draftPurchaseOrders: DraftPurchaseOrder[] = [];

  for (const [supplierId, items] of Object.entries(supplierGroups)) {
    const firstItem = items[0]!;
    const supplierName = firstItem.suggestedSupplierName || 'Unknown Supplier';

    const draftItems: DraftPurchaseOrderItem[] = items.map((p) => ({
      pendingReorderId: p.id,
      productId: p.productId,
      productName: p.productName,
      quantity: p.suggestedQuantity,
      unitPrice: p.suggestedUnitPrice || 0,
      supplierProductId: p.supplierProductId,
    }));

    const totalAmount = draftItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    draftPurchaseOrders.push({
      supplierId,
      supplierName,
      items: draftItems,
      totalAmount,
    });
  }

  // Update status to approved and publish event
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Mark all as approved
    await bulkUpdatePendingReorderStatus(client, pendingIds, 'approved');

    // Publish event for each draft PO
    const eventId = await generateUUID();
    await insertEventOutbox(client, {
      eventType: 'reorder.draft.approved.v1',
      aggregateType: 'pending_reorder',
      aggregateId: eventId,
      payload: {
        storeId,
        approvedIds: pendingIds,
        draftPurchaseOrders,
        approvedAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    return {
      approvedCount: pendingIds.length,
      draftPurchaseOrders,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Dismiss a pending reorder with a reason.
 */
export async function dismissPendingReorder(
  storeId: string,
  pendingId: string,
  reason: string
): Promise<PendingReorder> {
  // Validate reason
  if (!reason || reason.trim().length === 0) {
    throw new ApiError(400, 'INVALID_INPUT', 'Dismiss reason is required');
  }

  // Fetch pending reorder
  const pending = await getPendingReorderById(pendingId);
  if (!pending) {
    throw new ApiError(404, 'PENDING_REORDER_NOT_FOUND', `Pending reorder ${pendingId} not found`);
  }

  // Validate belongs to store
  if (pending.storeId !== storeId) {
    throw new ApiError(404, 'PENDING_REORDER_NOT_FOUND', `Pending reorder ${pendingId} not found`);
  }

  // Validate status
  if (pending.status !== 'pending') {
    throw new ApiError(
      400,
      'INVALID_STATUS',
      `Cannot dismiss pending reorder in '${pending.status}' status`
    );
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Update status to dismissed
    const updated = await updatePendingReorderStatus(client, pendingId, 'dismissed', {
      dismissedReason: reason.trim(),
    });

    if (!updated) {
      throw new ApiError(404, 'PENDING_REORDER_NOT_FOUND', `Pending reorder ${pendingId} not found`);
    }

    // Publish event
    await insertEventOutbox(client, {
      eventType: 'reorder.pending.dismissed.v1',
      aggregateType: 'pending_reorder',
      aggregateId: pendingId,
      payload: {
        storeId,
        pendingReorderId: pendingId,
        productId: pending.productId,
        reason: reason.trim(),
        dismissedAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Group pending reorders by supplier ID.
 */
function groupBySupplierId(
  pendingReorders: PendingReorder[]
): Record<string, PendingReorder[]> {
  const groups: Record<string, PendingReorder[]> = {};

  for (const pending of pendingReorders) {
    const supplierId = pending.suggestedSupplierId || 'unknown';
    if (!groups[supplierId]) {
      groups[supplierId] = [];
    }
    groups[supplierId].push(pending);
  }

  return groups;
}
