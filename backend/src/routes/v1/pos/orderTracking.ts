/**
 * GCP-STG-0744: POS order tracking
 * GET /pos/orders/:orderId/tracking — View order status + history for retailer
 */

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { log } from "../../../lib/logger";

export const posOrderTrackingRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

/**
 * GET /orders/:orderId/tracking
 * Returns current status + full history timeline for a purchase order
 */
posOrderTrackingRouter.get(
  "/orders/:orderId/tracking",
  requireDeviceToken,
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const posReq = req as PosRequest;
    const storeId = posReq.posDevice?.storeId;
    if (!storeId) return res.status(401).json({ error: "Store not identified" });

    const { orderId } = req.params;

    try {
      // Get order with store isolation
      const orderResult = await pool.query(
        `SELECT id, store_id, status, created_at, updated_at
         FROM orders.purchase_orders
         WHERE id = $1 AND store_id = $2`,
        [orderId, storeId]
      );

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: "Order not found" });
      }

      const order = orderResult.rows[0];

      // Get status history
      let history: any[] = [];
      try {
        const historyResult = await pool.query(
          `SELECT id, previous_status AS "previousStatus", new_status AS "newStatus",
                  changed_by_role AS "changedByRole", notes, created_at AS "createdAt"
           FROM orders.order_status_history
           WHERE order_id = $1
           ORDER BY created_at ASC`,
          [orderId]
        );
        history = historyResult.rows;
      } catch {
        // Table may not exist yet — return empty history
      }

      return res.json({
        data: {
          orderId: order.id,
          currentStatus: order.status,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          history,
        },
      });
    } catch (err: any) {
      log.error("[GCP-STG-0744] Order tracking error:", err?.message);
      return res.status(500).json({ error: "Failed to fetch order tracking" });
    }
  }
);
