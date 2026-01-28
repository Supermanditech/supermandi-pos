// GL-WF-044: Payout History Routes

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";

const router = Router();

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/supplier/payouts
 * GL-WF-044: Get payout history with pagination
 */
router.get("/", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM supplier.payouts WHERE supplier_id = $1`,
      [req.supplierId]
    );
    const total = parseInt(countResult.rows[0].count);

    // Get payouts
    const result = await pool.query(
      `SELECT
        id,
        amount_paise,
        currency,
        status,
        bank_account_number,
        bank_ifsc,
        bank_account_name,
        reference_id,
        payment_gateway_ref,
        failure_reason,
        initiated_at,
        completed_at,
        created_at
      FROM supplier.payouts
      WHERE supplier_id = $1
      ORDER BY initiated_at DESC
      LIMIT $2 OFFSET $3`,
      [req.supplierId, limit, offset]
    );

    res.json({
      data: result.rows.map(payout => ({
        id: payout.id,
        amountPaise: parseInt(payout.amount_paise),
        currency: payout.currency,
        status: payout.status,
        bankAccount: {
          accountNumber: payout.bank_account_number,
          ifsc: payout.bank_ifsc,
          accountName: payout.bank_account_name,
        },
        referenceId: payout.reference_id,
        paymentGatewayRef: payout.payment_gateway_ref,
        failureReason: payout.failure_reason,
        initiatedAt: payout.initiated_at,
        completedAt: payout.completed_at,
        createdAt: payout.created_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/payouts/summary
 * GL-WF-044: Get payout summary (total earnings, pending, paid)
 */
router.get("/summary", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Get payout summary
    const result = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_paise ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_paise ELSE 0 END), 0) as total_pending,
        COALESCE(SUM(CASE WHEN status = 'processing' THEN amount_paise ELSE 0 END), 0) as total_processing,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
      FROM supplier.payouts
      WHERE supplier_id = $1`,
      [req.supplierId]
    );

    const summary = result.rows[0];

    // Get total revenue from orders (if orders table exists)
    let totalRevenue = 0;
    try {
      const revenueResult = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total
        FROM orders.orders o
        INNER JOIN orders.order_items oi ON o.id = oi.order_id
        INNER JOIN supplier.supplier_products sp ON oi.product_id = sp.id
        WHERE sp.supplier_id = $1 AND o.status = 'delivered'`,
        [req.supplierId]
      );
      totalRevenue = parseInt(revenueResult.rows[0].total) || 0;
    } catch (e) {
      // Orders table might not exist in test env
    }

    res.json({
      data: {
        totalRevenuePaise: totalRevenue,
        totalPaidPaise: parseInt(summary.total_paid),
        totalPendingPaise: parseInt(summary.total_pending),
        totalProcessingPaise: parseInt(summary.total_processing),
        availableBalancePaise: totalRevenue - parseInt(summary.total_paid) - parseInt(summary.total_pending) - parseInt(summary.total_processing),
        completedPayouts: parseInt(summary.completed_count),
        pendingPayouts: parseInt(summary.pending_count),
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/payouts/:id
 * GL-WF-044: Get single payout details
 */
router.get("/:id", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    const result = await pool.query(
      `SELECT
        id,
        amount_paise,
        currency,
        status,
        bank_account_number,
        bank_ifsc,
        bank_account_name,
        reference_id,
        payment_gateway_ref,
        failure_reason,
        initiated_at,
        completed_at,
        created_at
      FROM supplier.payouts
      WHERE id = $1 AND supplier_id = $2`,
      [id, req.supplierId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Payout not found' }
      });
      return;
    }

    const payout = result.rows[0];

    res.json({
      data: {
        id: payout.id,
        amountPaise: parseInt(payout.amount_paise),
        currency: payout.currency,
        status: payout.status,
        bankAccount: {
          accountNumber: payout.bank_account_number,
          ifsc: payout.bank_ifsc,
          accountName: payout.bank_account_name,
        },
        referenceId: payout.reference_id,
        paymentGatewayRef: payout.payment_gateway_ref,
        failureReason: payout.failure_reason,
        initiatedAt: payout.initiated_at,
        completedAt: payout.completed_at,
        createdAt: payout.created_at,
      }
    });
  } catch (error) {
    next(error);
  }
});

export const supplierPayoutsRouter = router;
