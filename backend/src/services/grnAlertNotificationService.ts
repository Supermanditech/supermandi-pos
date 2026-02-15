/**
 * T-232: GRN Alert Notification Delivery Service
 *
 * When a GRN excess alert is created (stock received > ordered),
 * this service sends push notifications + in-app notifications
 * to the store owner and relevant admin users.
 */

import { getPool } from '../db/client';
import { sendAndPersistNotification } from './fcmService';

/**
 * Send push notification for a GRN excess alert.
 * Called from the GRN receive flow when excess is detected.
 */
export async function notifyGrnExcessAlert(input: {
  storeId: string;
  alertId?: string;
  orderId?: string;
  productName: string;
  orderedQty: number;
  receivedQty: number;
  excessQty: number;
  excessPct: number;
  orderNumber?: string;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    // Get store owner for notification
    const storeResult = await pool.query(
      `SELECT s.id, s.name, s.owner_id, u.id AS user_id
       FROM platform.stores s
       LEFT JOIN auth.users u ON u.store_id = s.id
       WHERE s.id = $1
       LIMIT 1`,
      [input.storeId]
    );

    if (storeResult.rows.length === 0) return;
    const store = storeResult.rows[0];

    const orderRef = input.orderNumber || input.orderId?.slice(0, 8) || 'unknown';
    const title = 'GRN Excess Alert';
    const body = `${input.productName}: Received ${input.receivedQty} vs ordered ${input.orderedQty} (+${input.excessQty} excess, ${input.excessPct}%) on PO ${orderRef}`;

    // Send to store (all store devices)
    await sendAndPersistNotification({
      recipientId: input.storeId,
      recipientType: 'store',
      title,
      body,
      data: {
        type: 'grn_excess',
        alertId: input.alertId || '',
        storeId: input.storeId,
        orderNumber: orderRef,
        productName: input.productName,
        excessQty: String(input.excessQty),
      },
      notificationType: 'grn_excess',
      priority: 'high',
    });

    console.log(`[T-232] GRN excess notification sent for store ${store.name} - ${input.productName}`);
  } catch (err) {
    // Non-blocking — log and continue
    console.error('[T-232] GRN alert notification failed:', err);
  }
}

/**
 * Send notification for GRN mismatch (short receipt).
 */
export async function notifyGrnMismatch(input: {
  storeId: string;
  orderId?: string;
  productName: string;
  orderedQty: number;
  receivedQty: number;
  shortQty: number;
  orderNumber?: string;
}): Promise<void> {
  try {
    const orderRef = input.orderNumber || input.orderId?.slice(0, 8) || 'unknown';
    const title = 'GRN Short Receipt';
    const body = `${input.productName}: Received ${input.receivedQty} vs ordered ${input.orderedQty} (short ${input.shortQty}) on PO ${orderRef}`;

    await sendAndPersistNotification({
      recipientId: input.storeId,
      recipientType: 'store',
      title,
      body,
      data: {
        type: 'grn_mismatch',
        storeId: input.storeId,
        orderNumber: orderRef,
        productName: input.productName,
        shortQty: String(input.shortQty),
      },
      notificationType: 'grn_mismatch',
      priority: 'normal',
    });
  } catch (err) {
    console.error('[T-232] GRN mismatch notification failed:', err);
  }
}

/**
 * Send notification when a purchase order status changes.
 * Notifies both the store and the supplier.
 */
export async function notifyOrderStatusChange(input: {
  storeId: string;
  orderId?: string;
  supplierId?: string;
  orderNumber?: string;
  previousStatus?: string;
  oldStatus?: string;
  newStatus: string;
  orderType?: string;
}): Promise<void> {
  try {
    const statusLabels: Record<string, string> = {
      submitted: 'Submitted',
      confirmed: 'Confirmed by Supplier',
      shipped: 'Shipped',
      delivered: 'Delivered',
      partial_received: 'Partially Received',
      cancelled: 'Cancelled',
    };

    const orderRef = input.orderNumber || input.orderId?.slice(0, 8) || 'unknown';
    const statusLabel = statusLabels[input.newStatus] || input.newStatus;

    // Notify store
    await sendAndPersistNotification({
      recipientId: input.storeId,
      recipientType: 'store',
      title: 'Order Update',
      body: `PO ${orderRef} is now ${statusLabel}${input.orderType === 'reorder' ? ' (Auto Reorder)' : ''}`,
      data: {
        type: 'order_status',
        storeId: input.storeId,
        orderNumber: orderRef,
        status: input.newStatus,
      },
      notificationType: 'order_status',
      priority: input.newStatus === 'delivered' ? 'high' : 'normal',
    });

    // Notify supplier (if applicable)
    if (input.supplierId && ['submitted', 'cancelled'].includes(input.newStatus)) {
      await sendAndPersistNotification({
        recipientId: input.supplierId,
        recipientType: 'supplier',
        title: input.newStatus === 'submitted' ? 'New Order Received' : 'Order Cancelled',
        body: `PO ${orderRef} has been ${statusLabel}`,
        data: {
          type: 'order_status',
          supplierId: input.supplierId,
          orderNumber: orderRef,
          status: input.newStatus,
        },
        notificationType: 'order_status',
        priority: 'high',
      });
    }
  } catch (err) {
    console.error('[T-232] Order status notification failed:', err);
  }
}
