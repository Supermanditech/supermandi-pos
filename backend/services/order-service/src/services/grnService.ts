// GRN Service - V3.0.9 compliant
// Goods Received Note processing with inventory-service integration

import { getClient, ApiError, ERROR_CODES } from '@supermandi/common';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import {
  getPurchaseOrderByIdAndStore,
  getPurchaseOrderItems,
  getNextReceiveNumber,
  createReceiveRecord,
  updateOrderItemReceivedQuantity,
  checkOrderFullyReceived,
  updateOrderStatus,
  createOrderEvent,
  writeToOutbox,
  PurchaseOrder,
  PurchaseOrderItem,
  ReceiveRecord,
  OrderStatus,
} from '../db/queries';
import { canReceive } from '../utils/stateMachine';

// =============================================================================
// TYPES
// =============================================================================

export interface ReceiveItemInput {
  orderItemId: string;
  quantityReceived: number;
  notes?: string;
}

export interface ReceiveGoodsInput {
  orderId: string;
  storeId: string;
  items: ReceiveItemInput[];
  notes?: string;
  receivedByUserId?: string;
}

export interface ReceiveGoodsResult {
  receiveRecord: ReceiveRecord;
  order: PurchaseOrder;
  updatedItems: PurchaseOrderItem[];
  inventoryUpdates: InventoryUpdateResult[];
}

interface InventoryUpdateResult {
  orderItemId: string;
  productId: string;
  quantity: number;
  success: boolean;
  ledgerEntryId?: string;
  error?: string;
}

interface InventoryServiceResponse {
  success: boolean;
  data?: {
    id: string;
    [key: string]: unknown;
  };
  error?: {
    code: string;
    message: string;
  };
}

// =============================================================================
// INVENTORY SERVICE CLIENT
// =============================================================================

/**
 * Call inventory-service to add stock (synchronous).
 * Uses POST /stores/{storeId}/stock with referenceType=grn_receive.
 */
async function callInventoryService(
  storeId: string,
  productId: string,
  quantity: number,
  referenceId: string,
  referenceSubId: string,
  authToken?: string
): Promise<{ success: boolean; ledgerEntryId?: string; error?: string }> {
  const url = `${config.services.inventoryService}/stores/${storeId}/stock`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Service-Name': 'order-service',
    'X-Idempotency-Key': `grn-${referenceSubId}-${productId}`,
  };

  // Forward user JWT if available
  if (authToken) {
    headers['Authorization'] = authToken;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        productId,
        adjustmentQty: quantity,
        referenceType: 'grn_receive',
        referenceId,
        referenceSubId,
        notes: `GRN receive for order ${referenceId}`,
      }),
    });

    const data = (await response.json()) as InventoryServiceResponse;

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error?.message ?? `Inventory service returned ${response.status}`,
      };
    }

    return {
      success: true,
      ledgerEntryId: data.data?.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Inventory service call failed',
    };
  }
}

// =============================================================================
// GRN SERVICE
// =============================================================================

/**
 * Receive goods for a purchase order (GRN).
 *
 * Critical flow:
 * 1. Validate order can receive goods (shipped or partial_received)
 * 2. Validate items being received
 * 3. Call inventory-service SYNCHRONOUSLY for each item
 * 4. If any inventory call fails, ROLLBACK entire operation
 * 5. Create receive record
 * 6. Update order item quantities
 * 7. Update order status if fully/partially received
 * 8. Write to outbox
 */
export async function receiveGoods(
  input: ReceiveGoodsInput,
  authToken?: string
): Promise<ReceiveGoodsResult> {
  // 1. Get and validate order
  const order = await getPurchaseOrderByIdAndStore(input.orderId, input.storeId);
  if (!order) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Order not found: ${input.orderId}`
    );
  }

  // 2. Validate order status
  if (!canReceive(order.status)) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Cannot receive goods for order in '${order.status}' status. Order must be 'shipped' or 'partial_received'.`
    );
  }

  // 3. Validate input has items
  if (!input.items || input.items.length === 0) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'At least one item must be received'
    );
  }

  // 4. Get order items for validation
  const orderItems = await getPurchaseOrderItems(input.orderId);
  const orderItemMap = new Map(orderItems.map((item) => [item.id, item]));

  // 5. Validate all items exist and quantities are valid
  for (const receiveItem of input.items) {
    const orderItem = orderItemMap.get(receiveItem.orderItemId);
    if (!orderItem) {
      throw new ApiError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Order item not found: ${receiveItem.orderItemId}`
      );
    }

    if (receiveItem.quantityReceived <= 0) {
      throw new ApiError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Quantity received must be positive for item ${orderItem.productName}`
      );
    }

    // Check if receiving more than remaining quantity
    const remainingQty = orderItem.orderedQuantity - orderItem.receivedQuantity;
    if (receiveItem.quantityReceived > remainingQty) {
      throw new ApiError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Cannot receive ${receiveItem.quantityReceived} units of ${orderItem.productName}. Only ${remainingQty} remaining.`
      );
    }
  }

  // Generate a unique receive ID for this GRN
  const receiveId = uuidv4();

  // 6. Call inventory-service for each item BEFORE updating database
  // This ensures we fail fast if inventory service is down
  const inventoryUpdates: InventoryUpdateResult[] = [];

  for (const receiveItem of input.items) {
    const orderItem = orderItemMap.get(receiveItem.orderItemId)!;

    const result = await callInventoryService(
      input.storeId,
      orderItem.productId,
      receiveItem.quantityReceived,
      input.orderId,
      receiveId,
      authToken
    );

    inventoryUpdates.push({
      orderItemId: receiveItem.orderItemId,
      productId: orderItem.productId,
      quantity: receiveItem.quantityReceived,
      success: result.success,
      ledgerEntryId: result.ledgerEntryId,
      error: result.error,
    });

    // If any inventory update fails, abort the entire operation
    if (!result.success) {
      throw new ApiError(
        502,
        'INVENTORY_SERVICE_ERROR',
        `Failed to update inventory for ${orderItem.productName}: ${result.error}`
      );
    }
  }

  // 7. All inventory updates succeeded - now update our database
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Generate receive number
    const receiveNumber = await getNextReceiveNumber(
      client,
      input.orderId,
      order.orderNumber
    );

    // Create receive record
    const receiveRecord = await createReceiveRecord(client, {
      orderId: input.orderId,
      receiveNumber,
      receivedByUserId: input.receivedByUserId,
      notes: input.notes,
      items: input.items,
    });

    // Update order item quantities
    const updatedItems: PurchaseOrderItem[] = [];
    for (const receiveItem of input.items) {
      const updatedItem = await updateOrderItemReceivedQuantity(
        client,
        receiveItem.orderItemId,
        receiveItem.quantityReceived
      );
      updatedItems.push(updatedItem);
    }

    // Check if order is fully or partially received
    const receiveStatus = await checkOrderFullyReceived(client, input.orderId);

    // Determine new order status
    let newStatus: OrderStatus = order.status;
    if (receiveStatus.fullyReceived) {
      newStatus = 'delivered';
    } else if (receiveStatus.partiallyReceived || order.status === 'shipped') {
      newStatus = 'partial_received';
    }

    // Update order status if changed
    let updatedOrder = order;
    if (newStatus !== order.status) {
      updatedOrder = await updateOrderStatus(
        client,
        input.orderId,
        newStatus,
        newStatus === 'delivered' ? 'actual_delivery_date' : undefined
      );

      // Log the status transition
      await createOrderEvent(client, {
        orderId: input.orderId,
        eventType: 'status_transition',
        fromStatus: order.status,
        toStatus: newStatus,
        actorId: input.receivedByUserId,
        actorType: input.receivedByUserId ? 'user' : 'system',
        metadata: {
          trigger: 'grn_receive',
          receiveRecordId: receiveRecord.id,
          receiveNumber,
        },
      });
    }

    // Log the GRN event
    await createOrderEvent(client, {
      orderId: input.orderId,
      eventType: 'grn_receive',
      actorId: input.receivedByUserId,
      actorType: input.receivedByUserId ? 'user' : 'system',
      metadata: {
        receiveRecordId: receiveRecord.id,
        receiveNumber,
        itemCount: input.items.length,
        totalQuantity: input.items.reduce((sum, i) => sum + i.quantityReceived, 0),
      },
    });

    // Write to outbox
    await writeToOutbox(client, {
      eventType: 'orders.po.received.v1',
      aggregateType: 'PurchaseOrder',
      aggregateId: input.orderId,
      payload: {
        orderId: input.orderId,
        storeId: input.storeId,
        supplierId: order.supplierId,
        orderNumber: order.orderNumber,
        receiveRecordId: receiveRecord.id,
        receiveNumber,
        previousStatus: order.status,
        newStatus: updatedOrder.status,
        itemsReceived: input.items.map((i) => ({
          orderItemId: i.orderItemId,
          quantityReceived: i.quantityReceived,
        })),
        receivedAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    return {
      receiveRecord,
      order: updatedOrder,
      updatedItems,
      inventoryUpdates,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// GET RECEIVE HISTORY
// =============================================================================

export { getReceiveRecords, getReceiveRecordItems } from '../db/queries';
