// Orders Routes - V3.0.10 compliant
// Purchase orders and GRN endpoints
// GO-LIVE: Uses requireDeviceToken middleware for POS device authentication

import { Router, Request, Response } from "express";
import { getPool } from "../../db/client";
import { requireDeviceToken, PosDeviceContext } from "../../middleware/deviceToken";

export const ordersRouter = Router();

/**
 * GO-LIVE: Get store ID from device token (set by requireDeviceToken middleware)
 * The middleware already validates store isolation via enforceStoreBinding
 */
function getStoreIdFromDevice(req: Request): string {
  const posDevice = (req as any).posDevice as PosDeviceContext;
  return posDevice.storeId!;
}

// =============================================================================
// PURCHASE ORDER ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/orders/stores/:storeId/orders
 * List purchase orders for a store.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { status, supplierId, fromDate, toDate, page = "1", limit = "20" } = req.query;

  try {
    let whereClause = "WHERE po.store_id = $1";
    const params: any[] = [storeId];
    let paramIndex = 2;

    if (status && typeof status === "string") {
      const statuses = status.split(",").map((s) => s.trim());
      whereClause += ` AND po.status = ANY($${paramIndex}::text[])`;
      params.push(statuses);
      paramIndex++;
    }

    if (supplierId && typeof supplierId === "string") {
      whereClause += ` AND po.supplier_id = $${paramIndex}`;
      params.push(supplierId);
      paramIndex++;
    }

    if (fromDate && typeof fromDate === "string") {
      whereClause += ` AND po.created_at >= $${paramIndex}`;
      params.push(new Date(fromDate).toISOString());
      paramIndex++;
    }

    if (toDate && typeof toDate === "string") {
      whereClause += ` AND po.created_at <= $${paramIndex}`;
      params.push(new Date(toDate).toISOString());
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM orders.purchase_orders po ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const offsetNum = (pageNum - 1) * limitNum;

    // Get paginated results
    const result = await pool.query(
      `SELECT
        po.id,
        po.order_number as "orderNumber",
        po.store_id as "storeId",
        po.supplier_id as "supplierId",
        COALESCE(s.name, 'Unknown Supplier') as "supplierName",
        po.order_type as "orderType",
        po.status,
        po.total_amount as "totalAmount",
        po.item_count as "itemCount",
        po.store_notes as "storeNotes",
        po.supplier_notes as "supplierNotes",
        po.delivery_address as "deliveryAddress",
        po.expected_delivery_date as "expectedDeliveryDate",
        po.actual_delivery_date as "actualDeliveryDate",
        po.tracking_number as "trackingNumber",
        po.carrier,
        po.created_by_user_id as "createdByUserId",
        po.created_at as "createdAt",
        po.updated_at as "updatedAt"
      FROM orders.purchase_orders po
      LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
      ${whereClause}
      ORDER BY po.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error("[Orders] List error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load orders",
    });
  }
});

/**
 * GET /api/v1/orders/stores/:storeId/orders/:orderId
 * Get a single purchase order with items.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders/:orderId", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;

  try {
    // Get order
    const orderResult = await pool.query(
      `SELECT
        po.id,
        po.order_number as "orderNumber",
        po.store_id as "storeId",
        po.supplier_id as "supplierId",
        COALESCE(s.name, 'Unknown Supplier') as "supplierName",
        po.order_type as "orderType",
        po.status,
        po.total_amount as "totalAmount",
        po.item_count as "itemCount",
        po.store_notes as "storeNotes",
        po.supplier_notes as "supplierNotes",
        po.delivery_address as "deliveryAddress",
        po.expected_delivery_date as "expectedDeliveryDate",
        po.actual_delivery_date as "actualDeliveryDate",
        po.tracking_number as "trackingNumber",
        po.carrier,
        po.created_by_user_id as "createdByUserId",
        po.created_at as "createdAt",
        po.updated_at as "updatedAt"
      FROM orders.purchase_orders po
      LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
      WHERE po.id = $1 AND po.store_id = $2`,
      [orderId, storeId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    const order = orderResult.rows[0];

    // Get order items
    // AUD-050: Fixed p.barcode -> p.primary_barcode (catalog.products has primary_barcode column)
    // ITER2: Added null-safe fallback for barcode
    const itemsResult = await pool.query(
      `SELECT
        poi.id,
        poi.order_id as "orderId",
        poi.supplier_product_id as "supplierProductId",
        poi.product_id as "productId",
        COALESCE(p.name, sp.name, 'Unknown Product') as "productName",
        COALESCE(p.primary_barcode, sp.barcode, '') as "barcode",
        poi.ordered_quantity as "orderedQuantity",
        poi.received_quantity as "receivedQuantity",
        poi.unit_price as "unitPrice",
        poi.total_price as "totalPrice",
        poi.status,
        poi.notes
      FROM orders.purchase_order_items poi
      LEFT JOIN catalog.products p ON p.id = poi.product_id
      LEFT JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
      WHERE poi.order_id = $1
      ORDER BY poi.created_at ASC`,
      [orderId]
    );

    return res.json({
      success: true,
      data: {
        ...order,
        items: itemsResult.rows,
      },
    });
  } catch (error: any) {
    console.error("[Orders] Get error:", error.message);

    // If table doesn't exist
    if (error.code === "42P01") {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load order",
    });
  }
});

/**
 * GET /api/v1/orders/stores/:storeId/orders/:orderId/events
 * Get order status history.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders/:orderId/events", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { orderId } = req.params;

  try {
    const result = await pool.query(
      `SELECT
        id,
        order_id as "orderId",
        event_type as "eventType",
        from_status as "fromStatus",
        to_status as "toStatus",
        actor_id as "actorId",
        actor_type as "actorType",
        metadata,
        created_at as "createdAt"
      FROM orders.order_events
      WHERE order_id = $1
      ORDER BY created_at ASC`,
      [orderId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("[Orders] Events error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load order events",
    });
  }
});

/**
 * POST /api/v1/orders/stores/:storeId/orders/:orderId/cancel
 * GL-PO-001: Cancel a purchase order (idempotent).
 * Returns 200 success even if order was already cancelled/deleted.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.post("/stores/:storeId/orders/:orderId/cancel", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;
  const { reason } = req.body || {};

  try {
    // Check if order exists
    const orderResult = await pool.query(
      `SELECT id, status FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    // GL-PO-001: If order doesn't exist, return success (idempotent)
    if (orderResult.rows.length === 0) {
      console.log(`[Orders] Cancel: order ${orderId} not found, returning idempotent success`);
      return res.json({
        success: true,
        message: "Order already cancelled or deleted",
        alreadyDeleted: true,
      });
    }

    const order = orderResult.rows[0];
    const currentStatus = order.status;

    // GL-PO-001: If already cancelled, return success (idempotent)
    if (currentStatus === "cancelled") {
      return res.json({
        success: true,
        message: "Order already cancelled",
        alreadyDeleted: true,
        data: order,
        transition: { from: "cancelled", to: "cancelled" },
      });
    }

    // Only allow cancelling draft, submitted, or confirmed orders
    const cancellableStatuses = ["draft", "submitted", "confirmed"];
    if (!cancellableStatuses.includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        error: "cannot_cancel",
        message: `Cannot cancel order in ${currentStatus} status`,
      });
    }

    // Update order status to cancelled
    const updateResult = await pool.query(
      `UPDATE orders.purchase_orders
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND store_id = $2
       RETURNING
         id,
         order_number as "orderNumber",
         store_id as "storeId",
         supplier_id as "supplierId",
         order_type as "orderType",
         status,
         total_amount as "totalAmount",
         item_count as "itemCount",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [orderId, storeId]
    );

    // Log the cancellation event
    try {
      await pool.query(
        `INSERT INTO orders.order_events (order_id, event_type, from_status, to_status, actor_type, metadata)
         VALUES ($1, 'status_change', $2, 'cancelled', 'system', $3)`,
        [orderId, currentStatus, JSON.stringify({ reason: reason || "user_cancelled" })]
      );
    } catch (eventErr: any) {
      // Non-critical, just log
      console.warn("[Orders] Failed to log cancel event:", eventErr.message);
    }

    return res.json({
      success: true,
      data: updateResult.rows[0],
      transition: {
        from: currentStatus,
        to: "cancelled",
      },
    });
  } catch (error: any) {
    console.error("[Orders] Cancel error:", error.message);

    // GL-PO-001: If table doesn't exist, return success (idempotent)
    if (error.code === "42P01") {
      return res.json({
        success: true,
        message: "Order system not initialized",
        alreadyDeleted: true,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to cancel order",
    });
  }
});

/**
 * DELETE /api/v1/orders/stores/:storeId/orders/:orderId
 * GL-PO-001: Delete a draft purchase order (idempotent).
 * Returns 200/204 even if order was already deleted.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.delete("/stores/:storeId/orders/:orderId", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;

  try {
    // Check if order exists and is in draft status
    const orderResult = await pool.query(
      `SELECT id, status FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    // GL-PO-001: If order doesn't exist, return 204 (idempotent success)
    if (orderResult.rows.length === 0) {
      console.log(`[Orders] Delete: order ${orderId} not found, returning idempotent 204`);
      return res.status(204).send();
    }

    const order = orderResult.rows[0];

    // Only allow deleting draft orders
    if (order.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "cannot_delete",
        message: `Cannot delete order in ${order.status} status. Only draft orders can be deleted.`,
      });
    }

    // Delete order items first
    await pool.query(
      `DELETE FROM orders.purchase_order_items WHERE order_id = $1`,
      [orderId]
    );

    // Delete order events
    await pool.query(
      `DELETE FROM orders.order_events WHERE order_id = $1`,
      [orderId]
    );

    // Delete the order
    await pool.query(
      `DELETE FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    // GL-PO-001: Return 204 No Content on successful delete
    return res.status(204).send();
  } catch (error: any) {
    console.error("[Orders] Delete error:", error.message);

    // GL-PO-001: If table doesn't exist, return 204 (idempotent success)
    if (error.code === "42P01") {
      return res.status(204).send();
    }

    return res.status(500).json({
      success: false,
      error: "Failed to delete order",
    });
  }
});

// =============================================================================
// GRN (GOODS RECEIVE) ENDPOINTS - AUD-GOLIVE-005
// =============================================================================

/**
 * POST /api/v1/orders/stores/:storeId/orders/:orderId/receive
 * AUD-GOLIVE-005: Receive goods for a purchase order (GRN).
 * Creates a receive record and updates inventory.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.post("/stores/:storeId/orders/:orderId/receive", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;
  const { items, notes } = req.body;

  // Validate items array
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: "items array is required and must not be empty",
    });
  }

  // Validate each item
  for (const item of items) {
    if (!item.orderItemId) {
      return res.status(400).json({
        success: false,
        error: "Each item must have orderItemId",
      });
    }
    if (typeof item.quantityReceived !== "number" || item.quantityReceived <= 0) {
      return res.status(400).json({
        success: false,
        error: "Each item must have quantityReceived > 0",
      });
    }
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Verify order exists and belongs to this store
      const orderResult = await client.query(
        `SELECT id, status, order_number FROM orders.purchase_orders
         WHERE id = $1 AND store_id = $2`,
        [orderId, storeId]
      );

      if (orderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      const order = orderResult.rows[0];

      // Only allow receiving for orders in valid status
      const receivableStatuses = ["confirmed", "shipped", "partially_received"];
      if (!receivableStatuses.includes(order.status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: `Cannot receive goods for order in '${order.status}' status`,
        });
      }

      // Create receive record
      const receiveResult = await client.query(
        `INSERT INTO orders.order_receives (order_id, notes)
         VALUES ($1, $2)
         RETURNING id, created_at as "createdAt"`,
        [orderId, notes || null]
      );

      const receiveId = receiveResult.rows[0].id;
      const receiveCreatedAt = receiveResult.rows[0].createdAt;

      // Process each item
      const updatedItems: Array<{
        id: string;
        productName: string;
        orderedQuantity: number;
        receivedQuantity: number;
        status: string;
      }> = [];

      for (const item of items) {
        // Get order item details
        const itemResult = await client.query(
          `SELECT
            poi.id,
            poi.product_id,
            poi.ordered_quantity,
            poi.received_quantity,
            COALESCE(p.name, 'Unknown Product') as "productName"
          FROM orders.purchase_order_items poi
          LEFT JOIN catalog.products p ON p.id = poi.product_id
          WHERE poi.id = $1 AND poi.order_id = $2`,
          [item.orderItemId, orderId]
        );

        if (itemResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            error: `Order item not found: ${item.orderItemId}`,
          });
        }

        const orderItem = itemResult.rows[0];
        const newReceivedQty = (orderItem.received_quantity || 0) + item.quantityReceived;

        // Determine item status
        let itemStatus = "partially_received";
        if (newReceivedQty >= orderItem.ordered_quantity) {
          itemStatus = "received";
        }

        // Update order item
        await client.query(
          `UPDATE orders.purchase_order_items
           SET received_quantity = $1, status = $2, updated_at = NOW()
           WHERE id = $3`,
          [newReceivedQty, itemStatus, item.orderItemId]
        );

        // Create receive item record
        await client.query(
          `INSERT INTO orders.order_receive_items (receive_id, order_item_id, quantity_received, notes)
           VALUES ($1, $2, $3, $4)`,
          [receiveId, item.orderItemId, item.quantityReceived, item.notes || null]
        );

        // Update inventory (stock balance)
        if (orderItem.product_id) {
          await client.query(
            `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
             VALUES ($1, $2, $3)
             ON CONFLICT (store_id, product_id)
             DO UPDATE SET current_qty = inventory.stock_balances.current_qty + $3, updated_at = NOW()`,
            [storeId, orderItem.product_id, item.quantityReceived]
          );

          // Also update catalog.store_products if it exists
          await client.query(
            `UPDATE catalog.store_products
             SET current_stock = COALESCE(current_stock, 0) + $3, updated_at = NOW()
             WHERE store_id = $1 AND product_id = $2`,
            [storeId, orderItem.product_id, item.quantityReceived]
          );
        }

        updatedItems.push({
          id: item.orderItemId,
          productName: orderItem.productName,
          orderedQuantity: orderItem.ordered_quantity,
          receivedQuantity: newReceivedQty,
          status: itemStatus,
        });
      }

      // Check if all items are fully received
      const remainingResult = await client.query(
        `SELECT COUNT(*) as remaining
         FROM orders.purchase_order_items
         WHERE order_id = $1 AND status != 'received'`,
        [orderId]
      );

      const remainingItems = parseInt(remainingResult.rows[0].remaining, 10);
      const newOrderStatus = remainingItems === 0 ? "received" : "partially_received";

      // Update order status
      await client.query(
        `UPDATE orders.purchase_orders
         SET status = $1, updated_at = NOW()
         WHERE id = $2`,
        [newOrderStatus, orderId]
      );

      // Log the receive event
      await client.query(
        `INSERT INTO orders.order_events (order_id, event_type, from_status, to_status, actor_type, metadata)
         VALUES ($1, 'goods_received', $2, $3, 'pos_device', $4)`,
        [
          orderId,
          order.status,
          newOrderStatus,
          JSON.stringify({ receiveId, itemCount: items.length }),
        ]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        data: {
          receiveRecord: {
            id: receiveId,
            orderId,
            notes: notes || null,
            createdAt: receiveCreatedAt,
          },
          order: {
            id: orderId,
            orderNumber: order.order_number,
            status: newOrderStatus,
          },
          itemsUpdated: updatedItems,
        },
      });
    } catch (innerError) {
      await client.query("ROLLBACK");
      throw innerError;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[Orders] Receive error:", error.message);

    if (error.code === "42P01") {
      return res.status(400).json({
        success: false,
        error: "Order system not fully initialized",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to receive goods",
    });
  }
});

/**
 * GET /api/v1/orders/stores/:storeId/orders/:orderId/receives
 * AUD-GOLIVE-005: Get receive history for an order.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders/:orderId/receives", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;

  try {
    // Verify order belongs to this store
    const orderCheck = await pool.query(
      `SELECT id FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    // Get receive records
    const result = await pool.query(
      `SELECT
        id,
        order_id as "orderId",
        notes,
        created_at as "createdAt"
      FROM orders.order_receives
      WHERE order_id = $1
      ORDER BY created_at DESC`,
      [orderId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("[Orders] List receives error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load receive records",
    });
  }
});

/**
 * GET /api/v1/orders/stores/:storeId/orders/:orderId/receives/:receiveId
 * AUD-GOLIVE-005: Get a specific receive record with items.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders/:orderId/receives/:receiveId", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId, receiveId } = req.params;

  try {
    // Verify order belongs to this store
    const orderCheck = await pool.query(
      `SELECT id FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    // Get receive record
    const receiveResult = await pool.query(
      `SELECT
        id,
        order_id as "orderId",
        notes,
        created_at as "createdAt"
      FROM orders.order_receives
      WHERE id = $1 AND order_id = $2`,
      [receiveId, orderId]
    );

    if (receiveResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Receive record not found",
      });
    }

    const receive = receiveResult.rows[0];

    // Get receive items
    const itemsResult = await pool.query(
      `SELECT
        ori.id,
        ori.order_item_id as "orderItemId",
        ori.quantity_received as "quantityReceived",
        ori.notes,
        COALESCE(p.name, 'Unknown Product') as "productName",
        COALESCE(p.primary_barcode, '') as "barcode"
      FROM orders.order_receive_items ori
      LEFT JOIN orders.purchase_order_items poi ON poi.id = ori.order_item_id
      LEFT JOIN catalog.products p ON p.id = poi.product_id
      WHERE ori.receive_id = $1`,
      [receiveId]
    );

    return res.json({
      success: true,
      data: {
        ...receive,
        items: itemsResult.rows,
      },
    });
  } catch (error: any) {
    console.error("[Orders] Get receive error:", error.message);

    if (error.code === "42P01") {
      return res.status(404).json({
        success: false,
        error: "Receive record not found",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load receive record",
    });
  }
});
