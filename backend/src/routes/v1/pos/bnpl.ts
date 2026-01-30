// SM-019: BNPL (Buy Now Pay Later) Routes
// Endpoints for viewing and managing BNPL drawdowns

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, PosDeviceContext } from "../../../middleware/deviceToken";
import { randomUUID } from "crypto";

export const posBnplRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
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
    const drawdownsResult = await pool.query(`
      SELECT
        bd.id,
        bd.supplier_id as "supplierId",
        COALESCE(s.business_name, s.trade_name, 'Unknown Supplier') as "supplierName",
        po.order_number as "orderNumber",
        bd.purchase_order_id as "purchaseOrderId",
        bd.principal_minor as "principalMinor",
        bd.due_date as "dueDate",
        bd.status,
        bd.created_at as "createdAt",
        (bd.due_date - CURRENT_DATE) as "daysRemaining"
      FROM payments.bnpl_drawdowns bd
      LEFT JOIN supplier.suppliers s ON s.id = bd.supplier_id
      LEFT JOIN orders.purchase_orders po ON po.id = bd.purchase_order_id
      WHERE bd.store_id = $1 AND bd.status = 'active'
      ORDER BY bd.due_date ASC
    `, [storeId]);

    // Get store's BNPL credit info
    const storeResult = await pool.query(`
      SELECT bnpl_enabled, bnpl_credit_limit, bnpl_max_days
      FROM platform.stores WHERE id = $1
    `, [storeId]);

    const store = storeResult.rows[0] || {};
    const creditLimit = store.bnpl_credit_limit || 5000000;

    // Calculate totals
    const totalOutstanding = drawdownsResult.rows.reduce(
      (sum, d) => sum + d.principalMinor, 0
    );
    const availableCredit = Math.max(0, creditLimit - totalOutstanding);

    // Format drawdowns with days remaining
    const drawdowns = drawdownsResult.rows.map(d => ({
      id: d.id,
      supplierId: d.supplierId,
      supplierName: d.supplierName,
      orderNumber: d.orderNumber,
      purchaseOrderId: d.purchaseOrderId,
      principalMinor: d.principalMinor,
      dueDate: d.dueDate,
      status: d.status,
      daysRemaining: Math.max(0, parseInt(d.daysRemaining || '0', 10)),
      isOverdue: parseInt(d.daysRemaining || '0', 10) < 0
    }));

    console.log(`[SM-019] BNPL active: storeId=${storeId}, count=${drawdowns.length}, outstanding=${totalOutstanding}`);

    return res.json({
      success: true,
      drawdowns,
      totalOutstanding,
      creditLimit,
      availableCredit,
      bnplEnabled: store.bnpl_enabled === true,
      maxDays: store.bnpl_max_days || 7
    });

  } catch (error: any) {
    console.error("[SM-019] BNPL active error:", error.message);

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

  } catch (error: any) {
    console.error("[SM-019] BNPL summary error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to load BNPL summary" });
  }
});

/**
 * POST /api/v1/pos/bnpl/:drawdownId/pay
 * SM-019: Pay off a BNPL drawdown
 * Generates UPI payment link for repayment
 */
posBnplRouter.post("/bnpl/:drawdownId/pay", requireDeviceToken, async (req: Request, res: Response) => {
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
    const drawdownResult = await client.query(`
      SELECT
        bd.id,
        bd.store_id,
        bd.supplier_id,
        bd.purchase_order_id,
        bd.principal_minor,
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

    const payAmount = amountMinor || drawdown.principal_minor;

    if (payAmount > drawdown.principal_minor) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Amount exceeds outstanding balance",
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

      console.log(`[SM-019] BNPL UPI repayment initiated: drawdownId=${drawdownId}, repaymentId=${repaymentId}`);

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
      // Mark drawdown as paid
      await client.query(`
        UPDATE payments.bnpl_drawdowns
        SET status = 'paid', paid_at = NOW(), paid_amount_minor = $1
        WHERE id = $2
      `, [payAmount, drawdownId]);

      // Update the original buy_payment
      await client.query(`
        UPDATE payments.buy_payments
        SET status = 'completed', completed_at = NOW()
        WHERE bnpl_drawdown_id = $1
      `, [drawdownId]);

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

      console.log(`[SM-019] BNPL cash repayment completed: drawdownId=${drawdownId}`);

      return res.json({
        success: true,
        status: 'paid',
        repaymentId,
        drawdownId,
        amountMinor: payAmount,
        mode: 'CASH',
        paidAt: new Date().toISOString()
      });
    }

    await client.query("ROLLBACK");
    return res.status(400).json({ success: false, error: "Invalid payment mode" });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[SM-019] BNPL pay error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to process BNPL payment" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/pos/bnpl/:drawdownId/pay/confirm
 * SM-019: Confirm UPI repayment with UTR
 */
posBnplRouter.post("/bnpl/:drawdownId/pay/confirm", requireDeviceToken, async (req: Request, res: Response) => {
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
    await client.query(`
      UPDATE payments.buy_payments
      SET status = 'completed', upi_payer_ref = $1, completed_at = NOW()
      WHERE id = $2
    `, [normalizedUtr, repaymentId]);

    // Mark drawdown as paid
    await client.query(`
      UPDATE payments.bnpl_drawdowns
      SET status = 'paid', paid_at = NOW(), paid_amount_minor = $1
      WHERE id = $2
    `, [repayment.amount_minor, drawdownId]);

    // Update the original BNPL buy_payment
    await client.query(`
      UPDATE payments.buy_payments
      SET status = 'completed', completed_at = NOW()
      WHERE bnpl_drawdown_id = $1 AND mode = 'BNPL'
    `, [drawdownId]);

    await client.query("COMMIT");

    console.log(`[SM-019] BNPL repayment confirmed: drawdownId=${drawdownId}, utr=${normalizedUtr}`);

    return res.json({
      success: true,
      status: 'paid',
      drawdownId,
      repaymentId,
      paidAt: new Date().toISOString()
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[SM-019] BNPL confirm error:", error.message);
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

  try {
    // Get repayment record with status
    const repaymentResult = await pool.query(`
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
    `, [repaymentId, storeId, drawdownId]);

    if (repaymentResult.rows.length === 0) {
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

    console.log(`[GL-RJ-008] BNPL status poll: repaymentId=${repaymentId}, status=${apiStatus}`);

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

  } catch (error: any) {
    console.error("[GL-RJ-008] BNPL status poll error:", error.message);
    return res.status(500).json({
      success: false,
      repaymentId,
      drawdownId,
      status: "failed",
      errorMessage: "Failed to get payment status"
    });
  }
});

export default posBnplRouter;
