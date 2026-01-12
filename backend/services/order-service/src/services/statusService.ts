// Status Service - V3.0.9 compliant
// Handles order status transitions with validation and event logging

import { getClient, ApiError, ERROR_CODES } from '@supermandi/common';
import {
  getPurchaseOrderByIdAndStore,
  getPurchaseOrderItems,
  updateOrderStatus,
  createOrderEvent,
  writeToOutbox,
  PurchaseOrder,
  OrderStatus,
  ActorType,
} from '../db/queries.js';
import {
  isValidTransition,
  getTransitionErrorMessage,
  canSubmit,
  canCancel,
} from '../utils/stateMachine.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TransitionActor {
  actorId?: string;
  actorType: ActorType;
}

export interface TransitionResult {
  order: PurchaseOrder;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}

// =============================================================================
// STATUS TIMESTAMP MAPPING
// =============================================================================

const statusTimestampMap: Partial<Record<OrderStatus, string>> = {
  submitted: 'submitted_at',
  confirmed: 'confirmed_at',
  shipped: 'shipped_at',
  delivered: 'actual_delivery_date',
  cancelled: 'cancelled_at',
};

// =============================================================================
// TRANSITION SERVICE
// =============================================================================

/**
 * Transition an order to a new status with validation.
 * Logs the transition to order_events and writes to outbox.
 */
export async function transitionStatus(
  orderId: string,
  storeId: string,
  targetStatus: OrderStatus,
  actor: TransitionActor,
  metadata?: Record<string, unknown>
): Promise<TransitionResult> {
  // Get order and validate ownership
  const order = await getPurchaseOrderByIdAndStore(orderId, storeId);
  if (!order) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Order not found: ${orderId}`
    );
  }

  const previousStatus = order.status;

  // Validate transition
  if (!isValidTransition(previousStatus, targetStatus)) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      getTransitionErrorMessage(previousStatus, targetStatus)
    );
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get timestamp field for this status if any
    const timestampField = statusTimestampMap[targetStatus];

    // Update order status
    const updatedOrder = await updateOrderStatus(
      client,
      orderId,
      targetStatus,
      timestampField
    );

    // Log the transition event
    await createOrderEvent(client, {
      orderId,
      eventType: 'status_transition',
      fromStatus: previousStatus,
      toStatus: targetStatus,
      actorId: actor.actorId,
      actorType: actor.actorType,
      metadata,
    });

    // Write to outbox
    await writeToOutbox(client, {
      eventType: `orders.po.${targetStatus}.v1`,
      aggregateType: 'PurchaseOrder',
      aggregateId: orderId,
      payload: {
        orderId,
        storeId: order.storeId,
        supplierId: order.supplierId,
        orderNumber: order.orderNumber,
        previousStatus,
        newStatus: targetStatus,
        actorId: actor.actorId,
        actorType: actor.actorType,
        transitionedAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    return {
      order: updatedOrder,
      previousStatus,
      newStatus: targetStatus,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// SUBMIT ORDER
// =============================================================================

/**
 * Submit a draft order.
 * Validates order has items before allowing submission.
 */
export async function submitOrder(
  orderId: string,
  storeId: string,
  actor: TransitionActor
): Promise<TransitionResult> {
  // Get order and validate
  const order = await getPurchaseOrderByIdAndStore(orderId, storeId);
  if (!order) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Order not found: ${orderId}`
    );
  }

  // Check if order can be submitted
  if (!canSubmit(order.status)) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Cannot submit order in '${order.status}' status. Only draft orders can be submitted.`
    );
  }

  // Validate order has items
  const items = await getPurchaseOrderItems(orderId);
  if (items.length === 0) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Cannot submit order with no items.'
    );
  }

  // Perform the transition
  return transitionStatus(orderId, storeId, 'submitted', actor, {
    itemCount: items.length,
    totalAmount: order.totalAmount,
  });
}

// =============================================================================
// CANCEL ORDER
// =============================================================================

/**
 * Cancel an order.
 * Can only cancel from draft, submitted, or confirmed status.
 */
export async function cancelOrder(
  orderId: string,
  storeId: string,
  actor: TransitionActor,
  reason?: string
): Promise<TransitionResult> {
  // Get order and validate
  const order = await getPurchaseOrderByIdAndStore(orderId, storeId);
  if (!order) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Order not found: ${orderId}`
    );
  }

  // Check if order can be cancelled
  if (!canCancel(order.status)) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Cannot cancel order in '${order.status}' status. Only draft, submitted, or confirmed orders can be cancelled.`
    );
  }

  // Perform the transition
  return transitionStatus(orderId, storeId, 'cancelled', actor, {
    reason: reason ?? 'Cancelled by user',
  });
}

// =============================================================================
// CONFIRM ORDER
// =============================================================================

/**
 * Confirm a submitted order.
 * Typically done by supplier or admin.
 */
export async function confirmOrder(
  orderId: string,
  storeId: string,
  actor: TransitionActor
): Promise<TransitionResult> {
  return transitionStatus(orderId, storeId, 'confirmed', actor);
}

// =============================================================================
// SHIP ORDER
// =============================================================================

/**
 * Mark order as shipped.
 */
export async function shipOrder(
  orderId: string,
  storeId: string,
  actor: TransitionActor,
  metadata?: { trackingNumber?: string; carrier?: string }
): Promise<TransitionResult> {
  return transitionStatus(orderId, storeId, 'shipped', actor, metadata);
}
