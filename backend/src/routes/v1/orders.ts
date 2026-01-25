// Orders Routes - V3.0.10 compliant
// Purchase orders and GRN endpoints
// ITER2-001: Added store-scoped authentication via x-actor-id

import { Router, Request, Response } from "express";
import { getPool } from "../../db/client";

export const ordersRouter = Router();

/**
 * ITER2-001: Get and validate store ID from gateway-provided x-actor-id header
 * Returns null if not authenticated or if path storeId doesn't match actor's store
 */
function getAndValidateStoreId(req: Request, pathStoreId: string): { storeId: string } | { error: string; status: number } {
  const actorId = req.headers['x-actor-id'];
  if (typeof actorId !== 'string' || !actorId) {
    return { error: "Unauthorized: Store not identified", status: 401 };
  }

  // Store isolation: Verify the requested storeId matches the authenticated user's store
  if (actorId !== pathStoreId) {
    console.warn(`[Orders] Store isolation violation: actor=${actorId} tried to access store=${pathStoreId}`);
    return { error: "Forbidden: Cannot access another store's data", status: 403 };
  }

  return { storeId: actorId };
}

// =============================================================================
// PURCHASE ORDER ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/orders/stores/:storeId/orders
 * List purchase orders for a store.
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
ordersRouter.get("/stores/:storeId/orders", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
  const { storeId } = authResult;
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
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
ordersRouter.get("/stores/:storeId/orders/:orderId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
  const { storeId } = authResult;
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
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
ordersRouter.get("/stores/:storeId/orders/:orderId/events", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
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
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
ordersRouter.post("/stores/:storeId/orders/:orderId/cancel", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
  const { storeId } = authResult;
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
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
ordersRouter.delete("/stores/:storeId/orders/:orderId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
  const { storeId } = authResult;
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
