// SM-005: Supplier Dashboard Routes
// Dashboard statistics

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";

const router = Router();

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/supplier/dashboard/stats
 * Get dashboard statistics
 */
router.get("/dashboard/stats", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Get product counts by approval status
    const productStats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE is_active = true) as total_products,
        COUNT(*) FILTER (WHERE approval_status = 'pending') as pending_products,
        COUNT(*) FILTER (WHERE approval_status = 'approved') as approved_products,
        COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected_products
      FROM catalog.supplier_products
      WHERE supplier_id = $1`,
      [req.supplierId]
    );

    // Get order counts and revenue
    // FIX: Use correct column names (order_id instead of purchase_order_id, line_total instead of line_total_minor)
    const orderStats = await pool.query(
      `SELECT
        COUNT(DISTINCT po.id) as total_orders,
        COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'pending') as pending_orders,
        COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'confirmed') as confirmed_orders,
        COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'shipped') as shipped_orders,
        COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'delivered') as delivered_orders,
        COALESCE(SUM(poi.line_total) FILTER (WHERE po.status = 'delivered'), 0) as total_revenue
      FROM orders.purchase_orders po
      JOIN orders.purchase_order_items poi ON poi.order_id = po.id
      JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
      WHERE sp.supplier_id = $1`,
      [req.supplierId]
    );

    // SUP-POS-007: Count new (unread) orders since supplier last viewed orders
    let newOrdersCount = 0;
    try {
      const unreadResult = await pool.query(
        `SELECT COUNT(DISTINCT po.id) as unread
         FROM orders.purchase_orders po
         JOIN orders.purchase_order_items poi ON poi.order_id = po.id
         JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
         WHERE sp.supplier_id = $1
           AND po.status IN ('pending', 'confirmed')
           AND po.created_at > COALESCE(
             (SELECT last_viewed_at FROM supplier.supplier_order_views WHERE supplier_id = $1),
             '1970-01-01'::timestamptz
           )`,
        [req.supplierId]
      );
      newOrdersCount = parseInt(unreadResult.rows[0]?.unread || '0');
    } catch {
      // Table may not exist yet — gracefully default to 0
    }

    const ps = productStats.rows[0];
    const os = orderStats.rows[0];

    res.json({
      data: {
        totalProducts: parseInt(ps.total_products) || 0,
        pendingProducts: parseInt(ps.pending_products) || 0,
        approvedProducts: parseInt(ps.approved_products) || 0,
        rejectedProducts: parseInt(ps.rejected_products) || 0,
        totalOrders: parseInt(os.total_orders) || 0,
        pendingOrders: parseInt(os.pending_orders) || 0,
        confirmedOrders: parseInt(os.confirmed_orders) || 0,
        shippedOrders: parseInt(os.shipped_orders) || 0,
        deliveredOrders: parseInt(os.delivered_orders) || 0,
        totalRevenue: parseInt(os.total_revenue) || 0,
        newOrdersCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const supplierDashboardRouter = router;
