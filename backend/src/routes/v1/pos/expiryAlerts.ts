// SCALE-C2: POS expiry alerts endpoint
// GET /api/v1/pos/inventory/expiring?daysAhead=30
// Returns products nearing or past expiry, with severity classification

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const posExpiryAlertsRouter = Router();

// =============================================================================
// SCALE-C2: POS EXPIRY ALERTS
// =============================================================================

/**
 * GET /api/v1/pos/inventory/expiring
 * Returns products nearing expiry for the authenticated store (device token auth).
 *
 * Query params:
 *   daysAhead: number (default 30, max 365) — how many days ahead to look
 *
 * Response:
 * {
 *   "expiring": [
 *     {
 *       "id": "...",          // store_product id
 *       "productId": "...",
 *       "name": "...",
 *       "barcode": "...",
 *       "quantity": 10,
 *       "expiryDate": "2026-04-15",
 *       "daysRemaining": 35,
 *       "batchNumber": "B001",
 *       "severity": "warning"  // "critical" if <=30d, "warning" if <=90d, "expired" if <0
 *     }
 *   ],
 *   "counts": { "critical": 3, "warning": 12, "expired": 1 }
 * }
 */
posExpiryAlertsRouter.get(
  "/inventory/expiring",
  requireDeviceToken,
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { storeId } = (req as any).posDevice as { storeId: string };

    // Parse and clamp daysAhead
    const rawDaysAhead = parseInt(String(req.query['daysAhead'] ?? '30'), 10);
    const daysAhead = isNaN(rawDaysAhead) || rawDaysAhead < 0 ? 30
      : rawDaysAhead > 365 ? 365
      : rawDaysAhead;

    try {
      const result = await pool.query(
        `SELECT
          sp.id,
          sp.product_id AS "productId",
          p.name,
          p.barcode,
          sp.current_stock AS quantity,
          TO_CHAR(sp.expiry_date::date, 'YYYY-MM-DD') AS "expiryDate",
          (sp.expiry_date::date - CURRENT_DATE) AS "daysRemaining",
          sp.batch_number AS "batchNumber"
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        WHERE sp.store_id = $1
          AND sp.expiry_date IS NOT NULL
          AND sp.expiry_date::date <= CURRENT_DATE + ($2 || ' days')::interval
          AND sp.expiry_date::date >= CURRENT_DATE - INTERVAL '1 day'
        ORDER BY sp.expiry_date ASC`,
        [storeId, daysAhead]
      );

      const expiring = result.rows.map((row) => {
        const days = Number(row.daysRemaining);
        let severity: 'expired' | 'critical' | 'warning';
        if (days < 0) {
          severity = 'expired';
        } else if (days <= 30) {
          severity = 'critical';
        } else {
          severity = 'warning';
        }
        return {
          id: row.id,
          productId: row.productId,
          name: row.name,
          barcode: row.barcode,
          quantity: Number(row.quantity) || 0,
          expiryDate: row.expiryDate,
          daysRemaining: days,
          batchNumber: row.batchNumber ?? null,
          severity,
        };
      });

      // Tally counts by severity
      const counts = expiring.reduce(
        (acc, p) => {
          acc[p.severity] = (acc[p.severity] || 0) + 1;
          return acc;
        },
        { expired: 0, critical: 0, warning: 0 } as Record<string, number>
      );

      return res.json({ expiring, counts });
    } catch (_err: unknown) {
      const err = asError(_err);
      log.error("[SCALE-C2] POS expiry alerts error:", err.message);
      return res.status(500).json({ error: "Failed to load expiry alerts" });
    }
  }
);
