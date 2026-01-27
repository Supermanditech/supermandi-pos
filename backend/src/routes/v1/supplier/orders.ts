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
 */
router.get("/orders", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Get orders where any item is from this supplier
    const result = await pool.query(
      `SELECT
        po.id,
        po.store_id,
        s.name as store_name,
        po.status,
        po.total_amount_minor as total_amount,
        po.created_at,
        po.updated_at,
        json_agg(
          json_build_object(
            'productId', poi.supplier_product_id,
            'productName', sp.name,
            'quantity', poi.quantity,
            'unitPrice', poi.unit_price_minor,
            'total', poi.line_total_minor
          )
        ) FILTER (WHERE sp.supplier_id = $1) as items
      FROM orders.purchase_orders po
      JOIN platform.stores s ON s.id = po.store_id
      JOIN orders.purchase_order_items poi ON poi.purchase_order_id = po.id
      JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
      WHERE sp.supplier_id = $1
      GROUP BY po.id, po.store_id, s.name, po.status, po.total_amount_minor, po.created_at, po.updated_at
      ORDER BY po.created_at DESC`,
      [req.supplierId]
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
       JOIN orders.purchase_order_items poi ON poi.purchase_order_id = po.id
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

export const supplierOrdersRouter = router;
