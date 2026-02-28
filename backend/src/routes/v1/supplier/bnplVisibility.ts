// T-280: Supplier-Side BNPL Visibility
// Shows suppliers which POs are BNPL-backed (payment guaranteed)

import { Router, Request, Response } from 'express';
import { getPool } from '../../../db/client';
import { log } from "../../../lib/logger";

export const supplierBnplRouter = Router();

/**
 * GET /api/v1/supplier/bnpl/backed-orders
 * List purchase orders that are BNPL-backed for this supplier
 * Supplier ID comes from JWT token (x-actor-id header from gateway)
 */
supplierBnplRouter.get('/backed-orders', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const supplierId = req.headers['x-actor-id'] as string;
  if (!supplierId) { res.status(401).json({ error: { code: 'NO_SUPPLIER' } }); return; }

  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const limit = Math.min(parseInt(String(req.query.limit || '50'), 10), 100);
  const offset = parseInt(String(req.query.offset || '0'), 10);

  try {
    const params: (string | number)[] = [supplierId, limit, offset];
    let statusFilter = '';
    if (status) {
      statusFilter = 'AND d.status = $4';
      params.push(status);
    }

    const result = await pool.query(
      `SELECT d.id AS drawdown_id, d.principal_minor, d.paid_amount_minor, d.due_date, d.status,
              d.purchase_order_id, d.created_at,
              COALESCE(d.provider_id, 'supermandi_internal') AS provider_id,
              COALESCE(p.provider_name, 'SuperMandi BNPL') AS provider_name,
              st.name AS store_name, st.code AS store_code
       FROM payments.bnpl_drawdowns d
       LEFT JOIN payments.credit_provider_configs p ON p.provider_id = d.provider_id
       LEFT JOIN platform.stores st ON st.id = d.store_id
       WHERE d.supplier_id = $1
         ${statusFilter}
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    // Summary stats
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN status IN ('active','partial','overdue') THEN 1 END) AS active,
         COALESCE(SUM(CASE WHEN status IN ('active','partial','overdue') THEN principal_minor - COALESCE(paid_amount_minor,0) ELSE 0 END), 0) AS outstanding_minor,
         COALESCE(SUM(principal_minor), 0) AS total_financed_minor,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN principal_minor ELSE 0 END), 0) AS total_repaid_minor
       FROM payments.bnpl_drawdowns
       WHERE supplier_id = $1`,
      [supplierId]
    );

    const summary = summaryResult.rows[0];

    res.json({
      success: true,
      orders: result.rows.map(row => ({
        drawdownId: row.drawdown_id,
        purchaseOrderId: row.purchase_order_id,
        principalMinor: row.principal_minor,
        paidAmountMinor: row.paid_amount_minor || 0,
        outstandingMinor: row.principal_minor - (row.paid_amount_minor || 0),
        dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date),
        status: row.status,
        providerId: row.provider_id,
        providerName: row.provider_name,
        storeName: row.store_name,
        storeCode: row.store_code,
        paymentGuaranteed: row.provider_id !== 'supermandi_internal', // External providers guarantee payment
        createdAt: row.created_at,
      })),
      summary: {
        totalOrders: parseInt(summary.total, 10),
        activeOrders: parseInt(summary.active, 10),
        outstandingMinor: parseInt(summary.outstanding_minor, 10),
        totalFinancedMinor: parseInt(summary.total_financed_minor, 10),
        totalRepaidMinor: parseInt(summary.total_repaid_minor, 10),
      },
    });
  } catch (err: any) {
    log.error('[T-280] Supplier BNPL visibility error:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR', message: 'Failed to load BNPL orders' } });
  }
});
