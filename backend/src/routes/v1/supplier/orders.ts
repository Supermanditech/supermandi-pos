// SM-005: Supplier Orders Routes
// View and manage orders from retailers

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";

const router = Router();

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/supplier/orders
 * List all orders for the authenticated supplier
 * GL-WF-063: Supports pagination via page and limit query params
 */
router.get("/orders", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // GL-WF-063: Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    // GL-WF-063: Get total count of unique orders for this supplier
    // FIX: Use correct column names (order_id instead of purchase_order_id)
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT po.id) as total
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE sp.supplier_id = $1`,
      [req.supplierId]
    );
    const total = parseInt(countResult.rows[0]?.total || '0');

    // Get orders where any item is from this supplier
    // GL-WF-063: Add LIMIT and OFFSET for pagination
    // GL-WF-038: Include item-level status for per-item tracking
    // FIX: Use correct column names from actual schema
    const result = await pool.query(
      `SELECT
        po.id,
        po.store_id,
        s.name as store_name,
        po.status,
        po.total_amount as total_amount,
        po.created_at,
        po.updated_at,
        json_agg(
          json_build_object(
            'id', poi.id,
            'productId', poi.supplier_product_id,
            'productName', sp.name,
            'quantity', poi.ordered_quantity,
            'receivedQuantity', poi.received_quantity,
            'unitPrice', poi.unit_price,
            'total', poi.line_total,
            'status', poi.status
          )
        ) FILTER (WHERE sp.supplier_id = $1) as items
      FROM orders.purchase_orders po
      JOIN platform.stores s ON s.id = po.store_id
      JOIN orders.purchase_order_items poi ON poi.order_id = po.id
      JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
      WHERE sp.supplier_id = $1
      GROUP BY po.id, po.store_id, s.name, po.status, po.total_amount, po.created_at, po.updated_at
      ORDER BY po.created_at DESC
      LIMIT $2 OFFSET $3`,
      [req.supplierId, limit, offset]
    );

    res.json({
      data: result.rows.map((o) => ({
        id: o.id,
        storeId: o.store_id,
        storeName: o.store_name,
        status: o.status,
        totalAmount: o.total_amount,
        items: o.items || [],
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
      // GL-WF-063: Pagination metadata
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/supplier/orders/:id/status
 * Update order status
 */
router.patch("/orders/:id/status", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `Status must be one of: ${validStatuses.join(', ')}` }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify this order contains items from this supplier
    const checkResult = await pool.query(
      `SELECT DISTINCT po.id, po.status
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE po.id = $1 AND sp.supplier_id = $2`,
      [id, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found' }
      });
      return;
    }

    const currentStatus = checkResult.rows[0].status;

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus]?.includes(status)) {
      res.status(400).json({
        error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${currentStatus} to ${status}` }
      });
      return;
    }

    // Update status
    const result = await pool.query(
      `UPDATE orders.purchase_orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, updated_at`,
      [status, id]
    );

    // Log the status change
    await pool.query(
      `INSERT INTO orders.order_events (purchase_order_id, event_type, actor_id, actor_type, metadata)
       VALUES ($1, $2, $3, 'supplier', $4)`,
      [
        id,
        `status_changed_to_${status}`,
        req.supplierId,
        JSON.stringify({ from: currentStatus, to: status }),
      ]
    );

    res.json({
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/supplier/orders/:id/shipment
 * GL-WF-039: Add shipment tracking information
 */
router.patch("/orders/:id/shipment", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { trackingNumber, carrier } = req.body;

    if (!trackingNumber || !carrier) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Tracking number and carrier are required' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify this order contains items from this supplier and is in confirmed/shipped status
    const checkResult = await pool.query(
      `SELECT DISTINCT po.id, po.status
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE po.id = $1 AND sp.supplier_id = $2`,
      [id, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found' }
      });
      return;
    }

    const currentStatus = checkResult.rows[0].status;
    if (!['confirmed', 'shipped'].includes(currentStatus)) {
      res.status(400).json({
        error: { code: 'INVALID_STATUS', message: 'Shipment info can only be added to confirmed or shipped orders' }
      });
      return;
    }

    // Update order with tracking info and set status to shipped if confirmed
    const newStatus = currentStatus === 'confirmed' ? 'shipped' : currentStatus;
    const result = await pool.query(
      `UPDATE orders.purchase_orders
       SET tracking_number = $1, carrier = $2, status = $3, shipped_at = COALESCE(shipped_at, NOW()), updated_at = NOW()
       WHERE id = $4
       RETURNING id, status, tracking_number, carrier, shipped_at, updated_at`,
      [trackingNumber, carrier, newStatus, id]
    );

    // Log the shipment event
    await pool.query(
      `INSERT INTO orders.order_events (purchase_order_id, event_type, actor_id, actor_type, metadata)
       VALUES ($1, 'shipment_added', $2, 'supplier', $3)`,
      [
        id,
        req.supplierId,
        JSON.stringify({ trackingNumber, carrier, previousStatus: currentStatus }),
      ]
    );

    res.json({
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        trackingNumber: result.rows[0].tracking_number,
        carrier: result.rows[0].carrier,
        shippedAt: result.rows[0].shipped_at,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/supplier/orders/:orderId/items/:itemId/status
 * GL-WF-038: Update individual order item status
 */
router.patch("/orders/:orderId/items/:itemId/status", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { orderId, itemId } = req.params;
    const { status, receivedQuantity } = req.body;

    const validStatuses = ['pending', 'partial', 'received', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `Status must be one of: ${validStatuses.join(', ')}` }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify this item belongs to an order from this supplier
    const checkResult = await pool.query(
      `SELECT poi.id, poi.status as current_status, poi.ordered_quantity, poi.received_quantity,
              po.id as order_id, po.status as order_status
       FROM orders.purchase_order_items poi
       JOIN orders.purchase_orders po ON po.id = poi.order_id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE poi.id = $1 AND po.id = $2 AND sp.supplier_id = $3`,
      [itemId, orderId, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order item not found' }
      });
      return;
    }

    const item = checkResult.rows[0];

    // Validate received_quantity if provided
    let newReceivedQty = item.received_quantity;
    if (receivedQuantity !== undefined) {
      if (receivedQuantity < 0 || receivedQuantity > item.ordered_quantity) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: `Received quantity must be between 0 and ${item.ordered_quantity}` }
        });
        return;
      }
      newReceivedQty = receivedQuantity;
    }

    // Auto-determine status based on received quantity if not explicitly set
    let finalStatus = status;
    if (status === 'received' && newReceivedQty < item.ordered_quantity) {
      finalStatus = 'partial';
    } else if (status === 'partial' && newReceivedQty === item.ordered_quantity) {
      finalStatus = 'received';
    }

    // Update item status
    const result = await pool.query(
      `UPDATE orders.purchase_order_items
       SET status = $1, received_quantity = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, status, received_quantity, ordered_quantity, updated_at`,
      [finalStatus, newReceivedQty, itemId]
    );

    // Log the item status change
    await pool.query(
      `INSERT INTO orders.order_events (purchase_order_id, event_type, actor_id, actor_type, metadata)
       VALUES ($1, $2, $3, 'supplier', $4)`,
      [
        orderId,
        'item_status_changed',
        req.supplierId,
        JSON.stringify({
          itemId,
          fromStatus: item.current_status,
          toStatus: finalStatus,
          receivedQuantity: newReceivedQty,
        }),
      ]
    );

    res.json({
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        receivedQuantity: result.rows[0].received_quantity,
        orderedQuantity: result.rows[0].ordered_quantity,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const supplierOrdersRouter = router;
