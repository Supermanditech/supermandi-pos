/**
 * GCP-STG-0739: Retailer dashboard analytics endpoints
 * - Sales trend (daily revenue + transactions)
 * - Top products by revenue
 * - Payment method breakdown
 *
 * All routes inherit requireStoreOwnership + requireActiveStore from v1Router middleware.
 * Store ID derived from gateway x-actor-id header (JWT-verified).
 */
import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";

export const retailerAnalyticsRouter = Router();

function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

/**
 * GET /api/v1/retailer-admin/analytics/sales-trend?days=30
 * Returns daily revenue + transaction count for the last N days.
 */
retailerAnalyticsRouter.get("/analytics/sales-trend", async (req: Request, res: Response) => {
  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "Database unavailable" });

  const days = Math.min(Math.max(parseInt(String(req.query.days) || "30", 10) || 30, 1), 90);

  try {
    const result = await pool.query(
      `SELECT
         DATE(s.created_at) as date,
         COALESCE(SUM(s.total_amount), 0)::bigint as revenue_minor,
         COUNT(*)::int as transactions
       FROM orders.sales s
       WHERE s.store_id = $1
         AND s.status IN ('PAID', 'COMPLETED')
         AND s.created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY DATE(s.created_at)
       ORDER BY date ASC`,
      [storeId, String(days)]
    );

    return res.json({
      data: result.rows.map(r => ({
        date: r.date,
        revenueMinor: Number(r.revenue_minor),
        transactions: r.transactions,
      })),
      days,
    });
  } catch (error) {
    log.error("[GCP-STG-0739] sales-trend error:", error);
    return res.status(500).json({ error: "Failed to fetch sales trend" });
  }
});

/**
 * GET /api/v1/retailer-admin/analytics/top-products?limit=10&days=30
 * Returns top products by revenue.
 */
retailerAnalyticsRouter.get("/analytics/top-products", async (req: Request, res: Response) => {
  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "Database unavailable" });

  const limit = Math.min(Math.max(parseInt(String(req.query.limit) || "10", 10) || 10, 1), 50);
  const days = Math.min(Math.max(parseInt(String(req.query.days) || "30", 10) || 30, 1), 90);

  try {
    const result = await pool.query(
      `SELECT
         si.product_name as name,
         COALESCE(SUM(si.line_total), 0)::bigint as revenue_minor,
         COALESCE(SUM(si.quantity), 0)::numeric as qty_sold
       FROM orders.sale_items si
       JOIN orders.sales s ON s.id = si.sale_id
       WHERE s.store_id = $1
         AND s.status IN ('PAID', 'COMPLETED')
         AND s.created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY si.product_name
       ORDER BY revenue_minor DESC
       LIMIT $3`,
      [storeId, String(days), limit]
    );

    return res.json({
      data: result.rows.map(r => ({
        name: r.name,
        revenueMinor: Number(r.revenue_minor),
        qtySold: Number(r.qty_sold),
      })),
      limit,
      days,
    });
  } catch (error) {
    log.error("[GCP-STG-0739] top-products error:", error);
    return res.status(500).json({ error: "Failed to fetch top products" });
  }
});

/**
 * GET /api/v1/retailer-admin/analytics/payment-methods?days=30
 * Returns payment method breakdown (Cash, UPI, DUE, etc.).
 */
retailerAnalyticsRouter.get("/analytics/payment-methods", async (req: Request, res: Response) => {
  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "Database unavailable" });

  const days = Math.min(Math.max(parseInt(String(req.query.days) || "30", 10) || 30, 1), 90);

  try {
    const result = await pool.query(
      `SELECT
         COALESCE(UPPER(s.payment_mode), 'UNKNOWN') as method,
         COALESCE(SUM(s.total_amount), 0)::bigint as total_minor,
         COUNT(*)::int as count
       FROM orders.sales s
       WHERE s.store_id = $1
         AND s.status IN ('PAID', 'COMPLETED')
         AND s.created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY UPPER(s.payment_mode)
       ORDER BY total_minor DESC`,
      [storeId, String(days)]
    );

    // Calculate percentages
    const totalAll = result.rows.reduce((sum, r) => sum + Number(r.total_minor), 0);

    return res.json({
      data: result.rows.map(r => ({
        method: r.method,
        totalMinor: Number(r.total_minor),
        count: r.count,
        percentage: totalAll > 0 ? Math.round((Number(r.total_minor) / totalAll) * 100) : 0,
      })),
      days,
      totalMinor: totalAll,
    });
  } catch (error) {
    log.error("[GCP-STG-0739] payment-methods error:", error);
    return res.status(500).json({ error: "Failed to fetch payment methods" });
  }
});
