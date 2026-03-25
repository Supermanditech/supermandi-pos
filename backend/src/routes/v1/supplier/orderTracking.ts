/**
 * GCP-STG-0744: Real-time order tracking
 * PATCH /supplier/orders/:orderId/status — Update order status (supplier side)
 * Records status transition + history in orders.order_status_history
 */

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import { log } from "../../../lib/logger";

export const supplierOrderTrackingRouter = Router();

const VALID_STATUSES = ['confirmed', 'shipped', 'delivered', 'cancelled'] as const;
type OrderStatus = typeof VALID_STATUSES[number];

/**
 * PATCH /orders/:orderId/status
 * Supplier updates order status and records history
 */
supplierOrderTrackingRouter.patch(
  "/orders/:orderId/status",
  requireSupplierAuth,
  async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      if (!pool) {
        res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
        return;
      }

      const { orderId } = req.params;
      const { status, notes } = req.body as { status?: string; notes?: string };
      const supplierId = req.supplierId;

      if (!status || !VALID_STATUSES.includes(status as OrderStatus)) {
        res.status(400).json({
          error: { code: "INVALID_STATUS", message: `Status must be one of: ${VALID_STATUSES.join(', ')}` },
        });
        return;
      }

      // Verify order belongs to this supplier
      const orderResult = await pool.query(
        `SELECT po.id, po.status AS current_status
         FROM orders.purchase_orders po
         JOIN orders.purchase_order_items poi ON poi.order_id = po.id
         JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
         WHERE po.id = $1 AND sp.supplier_id = $2
         LIMIT 1`,
        [orderId, supplierId]
      );

      if (orderResult.rows.length === 0) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
        return;
      }

      const currentStatus = orderResult.rows[0].current_status;

      // Update order status
      await pool.query(
        `UPDATE orders.purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, orderId]
      );

      // Record status history
      try {
        await pool.query(
          `INSERT INTO orders.order_status_history (order_id, previous_status, new_status, changed_by, changed_by_role, notes)
           VALUES ($1, $2, $3, $4, 'supplier', $5)`,
          [orderId, currentStatus, status, supplierId, notes || null]
        );
      } catch {
        // Table may not exist yet — log and continue
        log.warn("[GCP-STG-0744] order_status_history table may not exist yet");
      }

      res.json({
        data: {
          orderId,
          previousStatus: currentStatus,
          newStatus: status,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
