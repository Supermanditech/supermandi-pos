// SM-019: BNPL (Buy Now Pay Later) Routes
// Endpoints for viewing and managing BNPL drawdowns

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
// AUDIT-API-041/063: Rate limit BNPL financial endpoints
import { financialOperationsRateLimiter } from "../../../middleware/posRateLimiter";
import { randomUUID } from "crypto";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const posBnplRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

// =============================================================================
// STG-462: Daily prorated interest calculation
// CRITICAL: Uses principal * rate / 100 * (days / 365) — NOT flat formula
// =============================================================================
function calculateDailyProratedInterest(principalMinor: number, annualRatePercent: number, createdAt: Date | string): number {
  if (annualRatePercent <= 0) return 0;
  const start = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  // Daily prorated: principal * rate / 100 * (days / 365)
  return Math.round(principalMinor * annualRatePercent / 100 * (days / 365));
}

// =============================================================================
// STG-468: Configurable max days per store type
// =============================================================================
const BNPL_MAX_DAYS_BY_STORE_TYPE: Record<string, number> = {
  kirana: 7,
  supermarket: 14,
  wholesale: 21,
  chain: 30,
  default: 7,
};

function getMaxDaysForStoreType(storeType: string | null | undefined, storeMaxDays: number | null): number {
  // Store-level override takes precedence
  if (storeMaxDays && storeMaxDays > 0) return storeMaxDays;
  // Fall back to store type default
  return BNPL_MAX_DAYS_BY_STORE_TYPE[storeType || 'default'] || BNPL_MAX_DAYS_BY_STORE_TYPE.default;
}

/**
 * GET /api/v1/pos/bnpl/active
 * SM-019: Get active BNPL drawdowns for the store
 * Returns list of pending BNPL payments with due dates
 */
posBnplRouter.get("/bnpl/active", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;

  try {
    // Get active drawdowns with supplier info
    // T-153: Include paid_amount_minor and also show 'partial' status drawdowns
    // STG-465: Include per-supplier drawdown limit
    const drawdownsResult = await pool.query(`
      SELECT
        bd.id,
        bd.supplier_id as "supplierId",
        COALESCE(s.business_name, s.trade_name, 'Unknown Supplier') as "supplierName",
        po.order_number as "orderNumber",
        bd.purchase_order_id as "purchaseOrderId",
        bd.principal_minor as "principalMinor",
        COALESCE(bd.paid_amount_minor, 0) as "paidAmountMinor",
        bd.due_date as "dueDate",
        bd.status,
        bd.created_at as "createdAt",
        (bd.due_date - CURRENT_DATE) as "daysRemaining",
        COALESCE(ssl.bnpl_interest_rate, 0) as "interestRatePercent",
        COALESCE(ssl.bnpl_credit_limit, 0) as "supplierDrawdownLimit"
      FROM payments.bnpl_drawdowns bd
      LEFT JOIN supplier.suppliers s ON s.id = bd.supplier_id
      LEFT JOIN orders.purchase_orders po ON po.id = bd.purchase_order_id
      LEFT JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = bd.supplier_id AND ssl.store_id = bd.store_id
      WHERE bd.store_id = $1 AND bd.status IN ('active', 'partial')
      ORDER BY bd.due_date ASC
    `, [storeId]);

    // Get store's BNPL credit info
    // STG-468: Include store_type for configurable max days
    const storeResult = await pool.query(`
      SELECT bnpl_enabled, bnpl_credit_limit, bnpl_max_days, store_type
      FROM platform.stores WHERE id = $1
    `, [storeId]);

    const store = storeResult.rows[0] || {};
    const creditLimit = store.bnpl_credit_limit || 5000000;
    // STG-468: Max days configurable per store type
    const maxDays = getMaxDaysForStoreType(store.store_type, store.bnpl_max_days);

    // Calculate totals
    const totalOutstanding = drawdownsResult.rows.reduce(
      (sum, d) => sum + d.principalMinor, 0
    );
    const availableCredit = Math.max(0, creditLimit - totalOutstanding);

    // Format drawdowns with days remaining
    // T-153: Include paidAmountMinor in response for partial payment tracking
    // STG-462: Daily prorated interest — principal * rate / 100 * (days / 365)
    // STG-465: Per-supplier drawdown limit
    const drawdowns = drawdownsResult.rows.map(d => {
      const interestRate = parseFloat(d.interestRatePercent || '0');
      const principal = d.principalMinor;
      // STG-462: CRITICAL — daily prorated interest, NOT flat
      const interestMinor = calculateDailyProratedInterest(principal, interestRate, d.createdAt);
      const totalWithInterestMinor = principal + interestMinor;

      return {
      id: d.id,
      supplierId: d.supplierId,
      supplierName: d.supplierName,
      orderNumber: d.orderNumber,
      purchaseOrderId: d.purchaseOrderId,
      principalMinor: d.principalMinor,
      paidAmountMinor: parseInt(d.paidAmountMinor || '0', 10),
      dueDate: d.dueDate,
      status: d.status,
      createdAt: d.createdAt,
      daysRemaining: Math.max(0, parseInt(d.daysRemaining || '0', 10)),
      isOverdue: parseInt(d.daysRemaining || '0', 10) < 0,
      // STG-462: Daily prorated interest fields
      interestRatePercent: interestRate,
      interestMinor,
      totalWithInterestMinor,
      // STG-465: Per-supplier drawdown limit
      supplierDrawdownLimit: parseInt(d.supplierDrawdownLimit || '0', 10),
    };
    });

    log.info(`[SM-019] BNPL active: storeId=${storeId}, count=${drawdowns.length}, outstanding=${totalOutstanding}`);

    return res.json({
      success: true,
      drawdowns,
      totalOutstanding,
      creditLimit,
      availableCredit,
      bnplEnabled: store.bnpl_enabled === true,
      // STG-468: Configurable max days per store type
      maxDays,
    });

  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[SM-019] BNPL active error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        drawdowns: [],
        totalOutstanding: 0,
        creditLimit: 5000000,
        availableCredit: 5000000,
        bnplEnabled: false,
        maxDays: 7
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load BNPL drawdowns"
    });
  }
});

/**
 * GET /api/v1/pos/bnpl/summary
 * SM-019: Get BNPL summary for the store
 * Quick overview without full drawdown details
 */
posBnplRouter.get("/bnpl/summary", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;

  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COALESCE(SUM(principal_minor) FILTER (WHERE status = 'active'), 0) as outstanding,
        COUNT(*) FILTER (WHERE status = 'active' AND due_date < CURRENT_DATE) as overdue_count
      FROM payments.bnpl_drawdowns
      WHERE store_id = $1
    `, [storeId]);

    const storeResult = await pool.query(`
      SELECT bnpl_enabled, bnpl_credit_limit FROM platform.stores WHERE id = $1
    `, [storeId]);

    const store = storeResult.rows[0] || {};
    const creditLimit = store.bnpl_credit_limit || 5000000;
    const outstanding = parseInt(result.rows[0]?.outstanding || '0', 10);

    return res.json({
      success: true,
      activeCount: parseInt(result.rows[0]?.active_count || '0', 10),
      overdueCount: parseInt(result.rows[0]?.overdue_count || '0', 10),
      totalOutstanding: outstanding,
      creditLimit,
      availableCredit: Math.max(0, creditLimit - outstanding),
      bnplEnabled: store.bnpl_enabled === true
    });

  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[SM-019] BNPL summary error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to load BNPL summary" });
  }
});

/**
 * POST /api/v1/pos/bnpl/:drawdownId/pay
 * SM-019: Pay off a BNPL drawdown
 * Generates UPI payment link for repayment
 */
// BUG-003: Enforce store must be ACTIVE for BNPL payments
posBnplRouter.post("/bnpl/:drawdownId/pay", requireDeviceToken, requireActiveStore, financialOperationsRateLimiter, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;
  const { drawdownId } = req.params;
  const { mode, amountMinor } = req.body as { mode?: string; amountMinor?: number };

  if (!mode || !['UPI', 'CASH'].includes(mode)) {
    return res.status(400).json({
      success: false,
      error: "mode must be UPI or CASH"
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get drawdown details
    // DATA-003: Include paid_amount_minor to calculate remaining balance
    const drawdownResult = await client.query(`
      SELECT
        bd.id,
        bd.store_id,
        bd.supplier_id,
        bd.purchase_order_id,
        bd.principal_minor,
        COALESCE(bd.paid_amount_minor, 0) as paid_amount_minor,
        bd.status,
        bd.due_date,
        COALESCE(s.business_name, s.trade_name, 'SuperMandi') as supplier_name,
        s.upi_vpa as supplier_upi_vpa
      FROM payments.bnpl_drawdowns bd
      LEFT JOIN supplier.suppliers s ON s.id = bd.supplier_id
      WHERE bd.id = $1 AND bd.store_id = $2
    `, [drawdownId, storeId]);

    if (drawdownResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Drawdown not found"
      });
    }

    const drawdown = drawdownResult.rows[0];

    if (drawdown.status !== 'active') {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Cannot pay drawdown in '${drawdown.status}' status`
      });
    }

    // DATA-003: Calculate remaining balance for partial payment support
    const remainingBalance = drawdown.principal_minor - drawdown.paid_amount_minor;
    const payAmount = amountMinor || remainingBalance;

    if (payAmount > remainingBalance) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Amount exceeds outstanding balance",
        remainingBalance,
        principalMinor: drawdown.principal_minor
      });
    }

    // For UPI mode, generate payment link
    if (mode === 'UPI') {
      // Use SuperMandi's collection VPA for BNPL repayments
      const collectionVpa = process.env.SUPERMANDI_COLLECTION_VPA || 'supermandi@upi';
      const txnRef = `SM_BNPL_${Date.now().toString(36).toUpperCase()}`;
      const amountRupees = payAmount / 100;
      const note = `BNPL Repayment - ${drawdown.supplier_name}`;

      const deepLink = `upi://pay?pa=${collectionVpa}&pn=SuperMandi&am=${amountRupees.toFixed(2)}&cu=INR&tr=${txnRef}&tn=${encodeURIComponent(note)}`;

      // Create a repayment record (we'll confirm later)
      const repaymentId = randomUUID();
      await client.query(`
        INSERT INTO payments.buy_payments (
          id, purchase_order_id, store_id, supplier_id, mode, amount_minor,
          bnpl_drawdown_id, upi_txn_ref, upi_deep_link, status, initiated_at
        ) VALUES ($1, $2, $3, $4, 'UPI', $5, $6, $7, $8, 'initiated', NOW())
      `, [
        repaymentId,
        drawdown.purchase_order_id,
        storeId,
        drawdown.supplier_id,
        payAmount,
        drawdownId,
        txnRef,
        deepLink
      ]);

      await client.query("COMMIT");

      log.info(`[SM-019] BNPL UPI repayment initiated: drawdownId=${drawdownId}, repaymentId=${repaymentId}`);

      return res.json({
        success: true,
        repaymentId,
        drawdownId,
        amountMinor: payAmount,
        mode: 'UPI',
        upiCollect: {
          vpa: collectionVpa,
          amount: payAmount,
          deepLink
        },
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      });
    }

    // For CASH mode, mark as paid immediately (cashier confirms)
    if (mode === 'CASH') {
      // DATA-003: Distinguish partial vs full payment using remaining balance
      const isFullPayment = payAmount >= remainingBalance;

      // Update drawdown — only mark 'paid' if fully covered
      // DATA-003: Use 'partial' status for partial payments instead of keeping original status
      await client.query(`
        UPDATE payments.bnpl_drawdowns
        SET status = CASE
              WHEN COALESCE(paid_amount_minor, 0) + $1 >= principal_minor THEN 'paid'
              ELSE 'partial'
            END,
            paid_at = CASE
              WHEN COALESCE(paid_amount_minor, 0) + $1 >= principal_minor THEN NOW()
              ELSE paid_at
            END,
            paid_amount_minor = COALESCE(paid_amount_minor, 0) + $1
        WHERE id = $2 AND store_id = $3
      `, [payAmount, drawdownId, storeId]);

      // Only mark original buy_payment completed if fully paid
      if (isFullPayment) {
        await client.query(`
          UPDATE payments.buy_payments
          SET status = 'completed', completed_at = NOW()
          WHERE bnpl_drawdown_id = $1 AND store_id = $2
        `, [drawdownId, storeId]);
      }

      // Create a cash payment record
      const repaymentId = randomUUID();
      await client.query(`
        INSERT INTO payments.buy_payments (
          id, purchase_order_id, store_id, supplier_id, mode, amount_minor,
          bnpl_drawdown_id, status, initiated_at, completed_at
        ) VALUES ($1, $2, $3, $4, 'CASH', $5, $6, 'completed', NOW(), NOW())
      `, [
        repaymentId,
        drawdown.purchase_order_id,
        storeId,
        drawdown.supplier_id,
        payAmount,
        drawdownId
      ]);

      await client.query("COMMIT");

      // DATA-003: Log with actual status
      const actualStatus = isFullPayment ? 'paid' : 'partial';
      log.info(`[SM-019] BNPL cash repayment ${actualStatus}: drawdownId=${drawdownId}, amount=${payAmount}, remaining=${remainingBalance - payAmount}`);

      return res.json({
        success: true,
        status: actualStatus,
        repaymentId,
        drawdownId,
        amountMinor: payAmount,
        remainingBalance: remainingBalance - payAmount,
        mode: 'CASH',
        paidAt: isFullPayment ? new Date().toISOString() : undefined,
      });
    }

    await client.query("ROLLBACK");
    return res.status(400).json({ success: false, error: "Invalid payment mode" });

  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[SM-019] BNPL pay error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to process BNPL payment" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/pos/bnpl/:drawdownId/pay/confirm
 * SM-019: Confirm UPI repayment with UTR
 */
posBnplRouter.post("/bnpl/:drawdownId/pay/confirm", requireDeviceToken, requireActiveStore, financialOperationsRateLimiter, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;
  const { drawdownId } = req.params;
  const { repaymentId, upiTxnRef } = req.body as { repaymentId?: string; upiTxnRef?: string };

  if (!repaymentId) {
    return res.status(400).json({ success: false, error: "repaymentId is required" });
  }

  // GO-LIVE-127: Strict UTR validation (12-22 alphanumeric characters)
  if (!upiTxnRef || typeof upiTxnRef !== 'string') {
    return res.status(400).json({ success: false, error: "upiTxnRef (UTR) is required" });
  }
  const normalizedUtr = upiTxnRef.trim().toUpperCase().replace(/\s+/g, '');
  if (normalizedUtr.length < 12 || normalizedUtr.length > 22 || !/^[A-Z0-9]+$/.test(normalizedUtr)) {
    return res.status(400).json({
      success: false,
      error: "Invalid UTR format. UTR must be 12-22 alphanumeric characters."
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify repayment record
    const repaymentResult = await client.query(`
      SELECT id, bnpl_drawdown_id, status, amount_minor
      FROM payments.buy_payments
      WHERE id = $1 AND store_id = $2 AND bnpl_drawdown_id = $3
    `, [repaymentId, storeId, drawdownId]);

    if (repaymentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Repayment not found" });
    }

    const repayment = repaymentResult.rows[0];

    if (repayment.status === 'completed') {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Repayment already confirmed" });
    }

    if (repayment.status !== 'initiated') {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: `Cannot confirm repayment in '${repayment.status}' status` });
    }

    // Update repayment record (GO-LIVE-127: Use normalized UTR)
    // AUDIT-API-017: Add store_id filter for store isolation
    await client.query(`
      UPDATE payments.buy_payments
      SET status = 'completed', upi_payer_ref = $1, completed_at = NOW()
      WHERE id = $2 AND store_id = $3
    `, [normalizedUtr, repaymentId, storeId]);

    // Mark drawdown as paid
    await client.query(`
      UPDATE payments.bnpl_drawdowns
      SET status = 'paid', paid_at = NOW(), paid_amount_minor = $1
      WHERE id = $2 AND store_id = $3
    `, [repayment.amount_minor, drawdownId, storeId]);

    // Update the original BNPL buy_payment
    await client.query(`
      UPDATE payments.buy_payments
      SET status = 'completed', completed_at = NOW()
      WHERE bnpl_drawdown_id = $1 AND store_id = $2 AND mode = 'BNPL'
    `, [drawdownId, storeId]);

    await client.query("COMMIT");

    log.info(`[SM-019] BNPL repayment confirmed: drawdownId=${drawdownId}, utr=${normalizedUtr}`);

    return res.json({
      success: true,
      status: 'paid',
      drawdownId,
      repaymentId,
      paidAt: new Date().toISOString()
    });

  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[SM-019] BNPL confirm error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to confirm repayment" });
  } finally {
    client.release();
  }
});

// =============================================================================
// GL-RJ-008: BNPL Payment Status Polling
// Endpoint for auto-detecting when UPI payment completes
// =============================================================================

/**
 * GET /api/v1/pos/bnpl/:drawdownId/pay/:repaymentId/status
 * GL-RJ-008: Poll BNPL payment status for auto-detection
 * Returns current payment status for the given repayment
 */
posBnplRouter.get("/bnpl/:drawdownId/pay/:repaymentId/status", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;
  const { drawdownId, repaymentId } = req.params;

  if (!drawdownId || !repaymentId) {
    return res.status(400).json({
      success: false,
      error: "drawdownId and repaymentId are required"
    });
  }

  // STG-466: Use transaction with SELECT FOR UPDATE to prevent race conditions
  // when multiple polling requests hit simultaneously
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // STG-466: SELECT FOR UPDATE prevents concurrent reads from getting stale data
    const repaymentResult = await client.query(`
      SELECT
        bp.id,
        bp.bnpl_drawdown_id as "drawdownId",
        bp.status,
        bp.amount_minor as "amountMinor",
        bp.upi_payer_ref as utr,
        bp.completed_at as "paidAt",
        bp.failure_reason as "errorMessage"
      FROM payments.buy_payments bp
      WHERE bp.id = $1
        AND bp.store_id = $2
        AND bp.bnpl_drawdown_id = $3
      FOR UPDATE SKIP LOCKED
    `, [repaymentId, storeId, drawdownId]);

    if (repaymentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        repaymentId,
        drawdownId,
        status: "not_found",
        errorMessage: "Repayment not found"
      });
    }

    const repayment = repaymentResult.rows[0];

    // Map internal status to API status
    let apiStatus: "pending" | "processing" | "completed" | "failed" | "expired" = "pending";
    switch (repayment.status) {
      case "initiated":
        apiStatus = "pending";
        break;
      case "processing":
        apiStatus = "processing";
        break;
      case "completed":
        apiStatus = "completed";
        break;
      case "failed":
        apiStatus = "failed";
        break;
      default:
        apiStatus = "pending";
    }

    await client.query("COMMIT");

    log.info(`[GL-RJ-008] BNPL status poll: repaymentId=${repaymentId}, status=${apiStatus}`);

    return res.json({
      success: true,
      repaymentId,
      drawdownId: repayment.drawdownId,
      status: apiStatus,
      amountMinor: repayment.amountMinor,
      utr: repayment.utr || undefined,
      paidAt: repayment.paidAt || undefined,
      errorMessage: repayment.errorMessage || undefined
    });

  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK").catch(() => {});
    log.error("[GL-RJ-008] BNPL status poll error:", error.message);
    return res.status(500).json({
      success: false,
      repaymentId,
      drawdownId,
      status: "failed",
      errorMessage: "Failed to get payment status"
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// GO-LIVE-240: BNPL Dispute Submission
// Allows stores to dispute a BNPL drawdown
// =============================================================================

/**
 * POST /api/v1/pos/bnpl/:drawdownId/dispute
 * GO-LIVE-240: Submit a dispute for a BNPL drawdown
 * Creates a dispute record for review by support team
 */
posBnplRouter.post("/bnpl/:drawdownId/dispute", requireDeviceToken, requireActiveStore, financialOperationsRateLimiter, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;
  const { drawdownId } = req.params;
  const { reason, description } = req.body as { reason?: string; description?: string };

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "reason is required"
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify drawdown exists and belongs to this store
    const drawdownResult = await client.query(`
      SELECT id, store_id, status, supplier_id, principal_minor
      FROM payments.bnpl_drawdowns
      WHERE id = $1 AND store_id = $2
    `, [drawdownId, storeId]);

    if (drawdownResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Drawdown not found"
      });
    }

    const drawdown = drawdownResult.rows[0];

    // Check if dispute already exists
    const existingDispute = await client.query(`
      SELECT id FROM payments.bnpl_disputes
      WHERE drawdown_id = $1 AND status NOT IN ('resolved', 'rejected')
    `, [drawdownId]);

    if (existingDispute.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "An active dispute already exists for this drawdown"
      });
    }

    // Create dispute record
    const disputeId = randomUUID();
    await client.query(`
      INSERT INTO payments.bnpl_disputes (
        id, drawdown_id, store_id, supplier_id, reason, description, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'submitted', NOW())
    `, [disputeId, drawdownId, storeId, drawdown.supplier_id, reason.trim(), description?.trim() || null]);

    await client.query("COMMIT");

    log.info(`[GO-LIVE-240] BNPL dispute submitted: disputeId=${disputeId}, drawdownId=${drawdownId}, reason=${reason}`);

    return res.json({
      success: true,
      disputeId,
      drawdownId,
      status: "submitted",
      createdAt: new Date().toISOString()
    });

  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[GO-LIVE-240] BNPL dispute error:", error.message);

    // Handle missing table gracefully
    if (error.code === "42P01") {
      return res.status(503).json({
        success: false,
        error: "Dispute functionality not yet available"
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to submit dispute"
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// STG-467: Overdue Maturation Cron Endpoint
// CRITICAL: Wired as a callable endpoint, not just a function definition
// Call via POST /api/v1/pos/bnpl/cron/mature-overdue (internal/cron use)
// =============================================================================

/**
 * POST /api/v1/pos/bnpl/cron/mature-overdue
 * STG-467: Mature overdue BNPL drawdowns
 * Marks active drawdowns past due_date as 'overdue', and overdue > 30 days as 'defaulted'
 * Designed to be called by Cloud Scheduler or internal cron
 */
posBnplRouter.post("/bnpl/cron/mature-overdue", async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Mark active drawdowns past due_date as 'overdue'
    const overdueResult = await client.query(`
      UPDATE payments.bnpl_drawdowns
      SET status = 'overdue'
      WHERE status IN ('active', 'partial')
        AND due_date < CURRENT_DATE
      RETURNING id, store_id, supplier_id, principal_minor
    `);

    // Mark overdue drawdowns past 30 days as 'defaulted'
    const defaultedResult = await client.query(`
      UPDATE payments.bnpl_drawdowns
      SET status = 'defaulted'
      WHERE status = 'overdue'
        AND due_date < (CURRENT_DATE - INTERVAL '30 days')
      RETURNING id, store_id, supplier_id, principal_minor
    `);

    await client.query("COMMIT");

    const matured = overdueResult.rowCount || 0;
    const defaulted = defaultedResult.rowCount || 0;

    log.info(`[STG-467] BNPL maturation cron: matured=${matured} overdue, ${defaulted} defaulted`);

    return res.json({
      success: true,
      maturedToOverdue: matured,
      maturedToDefaulted: defaulted,
      overdueDrawdowns: overdueResult.rows,
      defaultedDrawdowns: defaultedResult.rows,
      processedAt: new Date().toISOString(),
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK").catch(() => {});
    log.error("[STG-467] BNPL maturation cron error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to process overdue maturation" });
  } finally {
    client.release();
  }
});

// =============================================================================
// STG-465: Per-Supplier Drawdown Limit Check
// =============================================================================

/**
 * GET /api/v1/pos/bnpl/supplier/:supplierId/limit
 * STG-465: Check per-supplier drawdown limit for a store
 */
posBnplRouter.get("/bnpl/supplier/:supplierId/limit", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;
  const { supplierId } = req.params;

  try {
    // Get per-supplier limit from supplier_store_links
    const linkResult = await pool.query(`
      SELECT
        COALESCE(ssl.bnpl_credit_limit, 0) as supplier_limit,
        COALESCE(ssl.bnpl_interest_rate, 0) as interest_rate
      FROM supplier.supplier_store_links ssl
      WHERE ssl.supplier_id = $1 AND ssl.store_id = $2
    `, [supplierId, storeId]);

    const supplierLimit = parseInt(linkResult.rows[0]?.supplier_limit || '0', 10);

    // Get current outstanding for this supplier
    const outstandingResult = await pool.query(`
      SELECT COALESCE(SUM(principal_minor - COALESCE(paid_amount_minor, 0)), 0) as outstanding
      FROM payments.bnpl_drawdowns
      WHERE store_id = $1 AND supplier_id = $2 AND status IN ('active', 'partial')
    `, [storeId, supplierId]);

    const outstanding = parseInt(outstandingResult.rows[0]?.outstanding || '0', 10);
    const available = Math.max(0, supplierLimit - outstanding);

    return res.json({
      success: true,
      supplierId,
      supplierLimit,
      outstanding,
      available,
      interestRate: parseFloat(linkResult.rows[0]?.interest_rate || '0'),
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[STG-465] Supplier limit check error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to check supplier limit" });
  }
});

// =============================================================================
// STG-464: Dispute Audit Trail — Get dispute history for a drawdown
// =============================================================================

/**
 * GET /api/v1/pos/bnpl/:drawdownId/disputes
 * STG-464: Get dispute history for a drawdown
 */
posBnplRouter.get("/bnpl/:drawdownId/disputes", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as unknown as PosRequest).posDevice;
  const { drawdownId } = req.params;

  try {
    const result = await pool.query(`
      SELECT
        id,
        drawdown_id as "drawdownId",
        reason,
        description,
        status,
        created_at as "createdAt",
        resolved_at as "resolvedAt",
        resolution_note as "resolutionNote"
      FROM payments.bnpl_disputes
      WHERE drawdown_id = $1 AND store_id = $2
      ORDER BY created_at DESC
    `, [drawdownId, storeId]);

    return res.json({
      success: true,
      disputes: result.rows,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[STG-464] Dispute history error:", error.message);

    // Handle missing table gracefully
    if (error.code === "42P01") {
      return res.json({ success: true, disputes: [] });
    }

    return res.status(500).json({ success: false, error: "Failed to load dispute history" });
  }
});

export default posBnplRouter;
