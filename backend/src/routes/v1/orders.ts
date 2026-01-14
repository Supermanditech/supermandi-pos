// Orders Routes - V3.0.10 compliant
// Purchase orders and GRN endpoints

import { Router, Request, Response } from "express";
import { getPool } from "../../db/client";

export const ordersRouter = Router();

// =============================================================================
// PURCHASE ORDER ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/orders/stores/:storeId/orders
 * List purchase orders for a store.
 */
ordersRouter.get("/stores/:storeId/orders", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = req.params;
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
 */
ordersRouter.get("/stores/:storeId/orders/:orderId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, orderId } = req.params;

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
    const itemsResult = await pool.query(
      `SELECT
        poi.id,
        poi.order_id as "orderId",
        poi.supplier_product_id as "supplierProductId",
        poi.product_id as "productId",
        COALESCE(p.name, sp.name, 'Unknown Product') as "productName",
        COALESCE(p.barcode, sp.barcode) as "barcode",
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
 */
ordersRouter.get("/stores/:storeId/orders/:orderId/events", async (req: Request, res: Response) => {
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
