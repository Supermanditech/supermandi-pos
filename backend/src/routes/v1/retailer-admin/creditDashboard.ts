// T-277: Credit Dashboard API for Retailer Admin portal
// Aggregated view across ALL providers — active loans, upcoming EMIs, credit utilization

import { Router, Request, Response } from 'express';
import { getPool } from '../../../db/client';
import { getStoreId, requireStoreContext } from '../../../middleware/retailerStoreContext';
import { creditRegistry } from '../../../services/credit/CreditProviderRegistry';
import { log } from "../../../lib/logger";

export const retailerCreditDashboardRouter = Router();
retailerCreditDashboardRouter.use(requireStoreContext);

/**
 * GET /api/v1/retailer-admin/reports/credit-summary
 * Full credit dashboard data for the retailer admin portal
 */
retailerCreditDashboardRouter.get('/reports/credit-summary', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } }); return; }

  const storeId = getStoreId(req);
  if (!storeId) { res.status(400).json({ error: { code: 'NO_STORE' } }); return; }

  try {
    // Aggregated balance across all providers
    const balance = await creditRegistry.getAggregatedBalance(storeId);

    // Active drawdowns with provider info
    const activeResult = await pool.query(
      `SELECT d.id, d.principal_minor, d.paid_amount_minor, d.due_date, d.status,
              COALESCE(d.provider_id, 'supermandi_internal') AS provider_id,
              d.external_loan_id, d.supplier_id, d.purchase_order_id, d.created_at,
              s.business_name AS supplier_name,
              p.provider_name
       FROM payments.bnpl_drawdowns d
       LEFT JOIN platform.suppliers s ON s.id = d.supplier_id
       LEFT JOIN payments.credit_provider_configs p ON p.provider_id = d.provider_id
       WHERE d.store_id = $1 AND d.status IN ('active', 'partial', 'overdue')
       ORDER BY d.due_date ASC`,
      [storeId]
    );

    // Upcoming EMIs (next 30 days) from repayment_schedules
    let upcomingEmis: any[] = [];
    try {
      const emiResult = await pool.query(
        `SELECT rs.*, d.supplier_id,
                COALESCE(p.provider_name, 'SuperMandi BNPL') AS provider_name,
                s.business_name AS supplier_name
         FROM payments.repayment_schedules rs
         JOIN payments.bnpl_drawdowns d ON d.id = rs.drawdown_id
         LEFT JOIN payments.credit_provider_configs p ON p.provider_id = rs.provider_id
         LEFT JOIN platform.suppliers s ON s.id = d.supplier_id
         WHERE rs.store_id = $1
           AND rs.status = 'pending'
           AND rs.due_date <= CURRENT_DATE + INTERVAL '30 days'
         ORDER BY rs.due_date ASC`,
        [storeId]
      );
      upcomingEmis = emiResult.rows;
    } catch {
      // Table may not exist yet
    }

    // Repayment history (last 90 days)
    const historyResult = await pool.query(
      `SELECT d.id, d.principal_minor, d.paid_amount_minor, d.due_date, d.paid_at, d.status,
              COALESCE(d.provider_id, 'supermandi_internal') AS provider_id,
              s.business_name AS supplier_name
       FROM payments.bnpl_drawdowns d
       LEFT JOIN platform.suppliers s ON s.id = d.supplier_id
       WHERE d.store_id = $1
         AND d.status IN ('paid', 'defaulted')
         AND d.paid_at >= NOW() - INTERVAL '90 days'
       ORDER BY d.paid_at DESC
       LIMIT 50`,
      [storeId]
    );

    // Credit applications status
    const appsResult = await pool.query(
      `SELECT id, offer_id, requested_amount_minor, approved_amount_minor, status, kyc_status, created_at
       FROM payments.credit_applications
       WHERE store_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [storeId]
    );

    res.json({
      success: true,
      balance,
      activeDrawdowns: activeResult.rows.map(row => ({
        id: row.id,
        principalMinor: row.principal_minor,
        paidAmountMinor: row.paid_amount_minor || 0,
        outstandingMinor: row.principal_minor - (row.paid_amount_minor || 0),
        dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date),
        status: row.status,
        providerId: row.provider_id,
        providerName: row.provider_name || 'SuperMandi BNPL',
        supplierName: row.supplier_name || 'Unknown',
        externalLoanId: row.external_loan_id,
        createdAt: row.created_at,
      })),
      upcomingEmis: upcomingEmis.map(row => ({
        installmentNumber: row.installment_number,
        dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date),
        principalMinor: row.principal_minor,
        interestMinor: row.interest_minor,
        totalMinor: row.total_minor,
        providerName: row.provider_name,
        supplierName: row.supplier_name,
      })),
      repaymentHistory: historyResult.rows.map(row => ({
        id: row.id,
        principalMinor: row.principal_minor,
        paidAmountMinor: row.paid_amount_minor || 0,
        dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date),
        paidAt: row.paid_at,
        status: row.status,
        providerId: row.provider_id,
        supplierName: row.supplier_name,
      })),
      applications: appsResult.rows,
    });
  } catch (err: any) {
    log.error('[T-277] Credit dashboard error:', err.message);
    res.status(500).json({ error: { code: 'QUERY_ERROR', message: 'Failed to load credit dashboard' } });
  }
});
