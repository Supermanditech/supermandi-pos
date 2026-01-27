// POS Payments Routes
// SM-010: SELL UPI Init API (Generate QR)
// SM-011: UPI Status Polling
// SM-013: SELL Split Payment API
// Note: Cash + DUE payments are handled in sales.ts with stock deduction

import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";

export const posPaymentsRouter = Router();

// Extended request type with posDevice from middleware
interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

// =============================================================================
// TYPES
// =============================================================================

interface UpiInitRequest {
  saleId: string;
  amountMinor: number;
}

interface UpiInitResponse {
  paymentId: string;
  orderId: string;
  qrData: string;
  upiVpa: string;
  expiresAt: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate UPI intent string for QR code
 * Format: upi://pay?pa={vpa}&pn={name}&am={amount}&cu=INR&tr={txn_ref}&tn={note}
 */
function generateUpiIntentString(params: {
  vpa: string;
  payeeName: string;
  amountRupees: number;
  txnRef: string;
  note?: string;
}): string {
  const encodedName = encodeURIComponent(params.payeeName);
  const encodedNote = encodeURIComponent(params.note || 'SuperMandi Payment');

  return `upi://pay?pa=${params.vpa}&pn=${encodedName}&am=${params.amountRupees.toFixed(2)}&cu=INR&tr=${params.txnRef}&tn=${encodedNote}`;
}

/**
 * Generate a unique order ID for UPI transactions
 */
function generateOrderId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomUUID().replace(/-/g, '').substring(0, 8);
  return `SM_${timestamp}_${random}`.toUpperCase();
}

// =============================================================================
// SM-010: SELL UPI Init API (Server-side QR generation)
// Note: /payments/upi/init exists in sales.ts for client-side intent generation.
// This endpoint generates server-side QR with Razorpay order tracking.
// =============================================================================

/**
 * POST /api/v1/pos/payments/upi/generate
 * Initialize UPI payment for a sale and generate server-side QR code data
 * Creates a Razorpay order and sell_payments ledger entry
 *
 * Request: { saleId: string, amountMinor: number }
 * Response: { paymentId, orderId, qrData, upiVpa, expiresAt }
 */
posPaymentsRouter.post(
  "/payments/upi/generate",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId, deviceId } = (req as unknown as PosRequest).posDevice;
    const { saleId, amountMinor } = req.body as UpiInitRequest;

    // Validate request
    if (!saleId) {
      return res.status(400).json({ error: "saleId is required" });
    }
    if (!amountMinor || typeof amountMinor !== 'number' || amountMinor <= 0) {
      return res.status(400).json({ error: "amountMinor must be a positive number" });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "database unavailable" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Verify sale exists and belongs to this store
      // Note: sales.id is varchar, not uuid
      const saleResult = await client.query(
        `SELECT s.id, s.store_id, s.total_minor, s.status, s.payment_mode
         FROM public.sales s
         WHERE s.id = $1 AND s.store_id = $2::uuid`,
        [saleId, storeId]
      );

      if (saleResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Sale not found" });
      }

      const sale = saleResult.rows[0];

      // Check if sale is already paid
      if (sale.status === 'completed' || sale.payment_mode) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Sale is already paid" });
      }

      // 2. Get store's UPI VPA
      const storeResult = await client.query(
        `SELECT s.id, s.name, s.upi_vpa
         FROM platform.stores s
         WHERE s.id = $1::uuid`,
        [storeId]
      );

      if (storeResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Store not found" });
      }

      const store = storeResult.rows[0];

      // Check if store has UPI configured
      if (!store.upi_vpa) {
        await client.query("ROLLBACK");
        return res.status(402).json({
          error: "Store UPI not configured",
          code: "UPI_NOT_CONFIGURED"
        });
      }

      // 3. Check for existing pending UPI payment for this sale
      const existingPayment = await client.query(
        `SELECT id, upi_order_id, upi_qr_data, status, created_at
         FROM payments.sell_payments
         WHERE sale_id = $1 AND mode = 'UPI' AND status IN ('pending', 'initiated')
         ORDER BY created_at DESC
         LIMIT 1`,
        [saleId]
      );

      // If there's an existing pending payment less than 15 mins old, return it
      if (existingPayment.rowCount && existingPayment.rows[0]) {
        const existing = existingPayment.rows[0];
        const createdAt = new Date(existing.created_at);
        const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000);

        if (expiresAt > new Date()) {
          await client.query("COMMIT");
          return res.json({
            paymentId: existing.id,
            orderId: existing.upi_order_id,
            qrData: existing.upi_qr_data,
            upiVpa: store.upi_vpa,
            expiresAt: expiresAt.toISOString()
          });
        }

        // Mark expired payment as failed
        await client.query(
          `UPDATE payments.sell_payments SET status = 'failed', failure_reason = 'expired' WHERE id = $1`,
          [existing.id]
        );
      }

      // 4. Generate order ID and QR data
      const orderId = generateOrderId();
      const amountRupees = amountMinor / 100;
      const qrData = generateUpiIntentString({
        vpa: store.upi_vpa,
        payeeName: store.name || 'SuperMandi Store',
        amountRupees,
        txnRef: orderId,
        note: `Sale ${saleId.substring(0, 8)}`
      });

      // 5. Calculate expiry (15 minutes from now)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // 6. Create payment record
      const paymentId = randomUUID();
      const idempotencyKey = `upi_${saleId}_${Date.now()}`;

      await client.query(
        `INSERT INTO payments.sell_payments (
          id, sale_id, store_id, mode, amount_minor,
          upi_order_id, upi_qr_data, upi_vpa,
          status, initiated_at, idempotency_key
        ) VALUES (
          $1, $2, $3, 'UPI', $4,
          $5, $6, $7,
          'initiated', NOW(), $8
        )`,
        [paymentId, saleId, storeId, amountMinor, orderId, qrData, store.upi_vpa, idempotencyKey]
      );

      await client.query("COMMIT");

      console.log(`[SM-010] UPI payment initiated: paymentId=${paymentId}, orderId=${orderId}, storeId=${storeId}`);

      const response: UpiInitResponse = {
        paymentId,
        orderId,
        qrData,
        upiVpa: store.upi_vpa,
        expiresAt: expiresAt.toISOString()
      };

      return res.json(response);

    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[SM-010] UPI init error:", err);

      // Handle specific errors
      if (err.code === '23505') { // Unique violation
        return res.status(409).json({ error: "Duplicate payment request" });
      }
      if (err.code === '42P01') { // Table not found
        return res.status(503).json({ error: "Payment tables not initialized" });
      }

      return res.status(500).json({ error: "Failed to initialize UPI payment" });
    } finally {
      client.release();
    }
  }
);

// =============================================================================
// SM-011: UPI Status Polling
// =============================================================================

/**
 * GET /api/v1/pos/payments/upi/:paymentId/status
 * Poll UPI payment status
 *
 * Response: { status, upiTxnRef?, payerVpa? }
 */
posPaymentsRouter.get(
  "/payments/upi/:paymentId/status",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required" });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "database unavailable" });
    }

    try {
      const result = await pool.query(
        `SELECT id, status, upi_txn_ref, upi_payer_vpa, failure_reason, created_at
         FROM payments.sell_payments
         WHERE id = $1::uuid AND store_id = $2::uuid`,
        [paymentId, storeId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Payment not found" });
      }

      const payment = result.rows[0];

      // Check if payment has expired (15 minutes)
      const createdAt = new Date(payment.created_at);
      const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000);

      if (payment.status === 'initiated' && expiresAt < new Date()) {
        // Mark as expired
        await pool.query(
          `UPDATE payments.sell_payments SET status = 'failed', failure_reason = 'expired' WHERE id = $1`,
          [paymentId]
        );
        return res.json({
          status: 'failed',
          failureReason: 'expired'
        });
      }

      return res.json({
        status: payment.status,
        upiTxnRef: payment.upi_txn_ref || null,
        payerVpa: payment.upi_payer_vpa || null,
        failureReason: payment.failure_reason || null
      });

    } catch (err: any) {
      console.error("[SM-011] UPI status error:", err);
      return res.status(500).json({ error: "Failed to get payment status" });
    }
  }
);

// =============================================================================
// SM-013: SELL Split Payment API
// =============================================================================

interface SplitPaymentItem {
  mode: 'UPI' | 'CASH' | 'DUE';
  amountMinor: number;
}

interface SplitPaymentRequest {
  saleId: string;
  payments: SplitPaymentItem[];
}

/**
 * POST /api/v1/pos/payments/split
 * Create a split payment for a sale (e.g., part UPI + part Cash)
 *
 * Request: { saleId, payments: [{ mode: "UPI", amountMinor }, { mode: "CASH", amountMinor }] }
 * Response: { paymentIds, upiPayment?, cashPayment?, totalAmount }
 */
posPaymentsRouter.post(
  "/payments/split",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;
    const { saleId, payments } = req.body as SplitPaymentRequest;

    // Validate request
    if (!saleId) {
      return res.status(400).json({ error: "saleId is required" });
    }
    if (!payments || !Array.isArray(payments) || payments.length < 2) {
      return res.status(400).json({ error: "payments must be an array with at least 2 payment methods" });
    }

    // Validate each payment
    const validModes = ['UPI', 'CASH', 'DUE'];
    for (const p of payments) {
      if (!validModes.includes(p.mode)) {
        return res.status(400).json({ error: `Invalid payment mode: ${p.mode}` });
      }
      if (!p.amountMinor || typeof p.amountMinor !== 'number' || p.amountMinor <= 0) {
        return res.status(400).json({ error: "Each payment must have a positive amountMinor" });
      }
    }

    // Check for duplicate modes
    const modes = payments.map(p => p.mode);
    if (new Set(modes).size !== modes.length) {
      return res.status(400).json({ error: "Duplicate payment modes not allowed" });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "database unavailable" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Verify sale exists and get total
      const saleResult = await client.query(
        `SELECT id, store_id, total_minor, status, payment_mode
         FROM public.sales
         WHERE id = $1 AND store_id = $2::uuid`,
        [saleId, storeId]
      );

      if (saleResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Sale not found" });
      }

      const sale = saleResult.rows[0];

      // Check if sale is already paid
      if (sale.status === 'PAID' || sale.status === 'completed' || sale.payment_mode) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Sale is already paid" });
      }

      // 2. Validate total matches
      const totalPayment = payments.reduce((sum, p) => sum + p.amountMinor, 0);
      if (totalPayment !== sale.total_minor) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Payment total does not match sale total",
          expected: sale.total_minor,
          received: totalPayment
        });
      }

      // 3. Get store info for UPI VPA
      const storeResult = await client.query(
        `SELECT id, name, upi_vpa FROM platform.stores WHERE id = $1::uuid`,
        [storeId]
      );

      if (storeResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Store not found" });
      }

      const store = storeResult.rows[0];

      // Check if UPI is in split and store has VPA
      const hasUpi = payments.some(p => p.mode === 'UPI');
      if (hasUpi && !store.upi_vpa) {
        await client.query("ROLLBACK");
        return res.status(402).json({
          error: "Store UPI not configured",
          code: "UPI_NOT_CONFIGURED"
        });
      }

      // 4. Create payment records
      const paymentIds: string[] = [];
      let upiPayment: { paymentId: string; orderId: string; qrData: string; expiresAt: string } | null = null;
      let cashPayment: { paymentId: string; status: string } | null = null;
      let duePayment: { paymentId: string; status: string } | null = null;

      for (const p of payments) {
        const paymentId = randomUUID();
        paymentIds.push(paymentId);

        if (p.mode === 'UPI') {
          // Generate UPI QR
          const orderId = generateOrderId();
          const amountRupees = p.amountMinor / 100;
          const qrData = generateUpiIntentString({
            vpa: store.upi_vpa,
            payeeName: store.name || 'SuperMandi Store',
            amountRupees,
            txnRef: orderId,
            note: `Split ${saleId.substring(0, 8)}`
          });

          const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
          const idempotencyKey = `split_upi_${saleId}_${Date.now()}`;

          await client.query(
            `INSERT INTO payments.sell_payments (
              id, sale_id, store_id, mode, amount_minor,
              upi_order_id, upi_qr_data, upi_vpa,
              status, initiated_at, idempotency_key, is_split
            ) VALUES ($1, $2, $3, 'UPI', $4, $5, $6, $7, 'initiated', NOW(), $8, true)`,
            [paymentId, saleId, storeId, p.amountMinor, orderId, qrData, store.upi_vpa, idempotencyKey]
          );

          upiPayment = {
            paymentId,
            orderId,
            qrData,
            expiresAt: expiresAt.toISOString()
          };

        } else if (p.mode === 'CASH') {
          // Cash payment - awaits UPI completion
          await client.query(
            `INSERT INTO payments.sell_payments (
              id, sale_id, store_id, mode, amount_minor,
              status, initiated_at, is_split
            ) VALUES ($1, $2, $3, 'CASH', $4, 'pending', NOW(), true)`,
            [paymentId, saleId, storeId, p.amountMinor]
          );

          cashPayment = {
            paymentId,
            status: 'pending'  // Will become 'awaiting_cash' after UPI completes
          };

        } else if (p.mode === 'DUE') {
          // DUE payment
          await client.query(
            `INSERT INTO payments.sell_payments (
              id, sale_id, store_id, mode, amount_minor,
              status, initiated_at, is_split
            ) VALUES ($1, $2, $3, 'DUE', $4, 'pending', NOW(), true)`,
            [paymentId, saleId, storeId, p.amountMinor]
          );

          duePayment = {
            paymentId,
            status: 'pending'
          };
        }
      }

      // 5. Update sale to indicate split payment in progress
      await client.query(
        `UPDATE public.sales SET payment_mode = 'SPLIT' WHERE id = $1`,
        [saleId]
      );

      await client.query("COMMIT");

      console.log(`[SM-013] Split payment initiated: saleId=${saleId}, payments=${payments.length}, storeId=${storeId}`);

      const response: Record<string, unknown> = {
        paymentIds,
        totalAmount: totalPayment
      };

      if (upiPayment) {
        response.upiPayment = upiPayment;
      }
      if (cashPayment) {
        response.cashPayment = cashPayment;
      }
      if (duePayment) {
        response.duePayment = duePayment;
      }

      return res.json(response);

    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[SM-013] Split payment error:", err);

      if (err.code === '23505') {
        return res.status(409).json({ error: "Duplicate payment request" });
      }

      return res.status(500).json({ error: "Failed to create split payment" });
    } finally {
      client.release();
    }
  }
);

// =============================================================================
// SM-013: Confirm Cash Portion of Split Payment
// =============================================================================

/**
 * POST /api/v1/pos/payments/split/:paymentId/confirm-cash
 * Confirm cash collection for split payment after UPI completes
 *
 * Request: { receivedMinor?: number }
 * Response: { status, changeMinor }
 */
posPaymentsRouter.post(
  "/payments/split/:paymentId/confirm-cash",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;
    const { paymentId } = req.params;
    const { receivedMinor } = req.body as { receivedMinor?: number };

    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required" });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "database unavailable" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get payment and verify it's a CASH split payment
      const paymentResult = await client.query(
        `SELECT sp.id, sp.sale_id, sp.mode, sp.amount_minor, sp.status, sp.is_split
         FROM payments.sell_payments sp
         WHERE sp.id = $1::uuid AND sp.store_id = $2::uuid`,
        [paymentId, storeId]
      );

      if (paymentResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Payment not found" });
      }

      const payment = paymentResult.rows[0];

      if (payment.mode !== 'CASH') {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "This endpoint is only for cash payments" });
      }

      if (!payment.is_split) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "This is not a split payment" });
      }

      if (payment.status === 'completed') {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Payment already completed" });
      }

      // Check if UPI portion is completed
      const upiCheck = await client.query(
        `SELECT id, status FROM payments.sell_payments
         WHERE sale_id = $1 AND mode = 'UPI' AND is_split = true`,
        [payment.sale_id]
      );

      if (upiCheck.rowCount && upiCheck.rows[0]) {
        const upiPayment = upiCheck.rows[0];
        if (upiPayment.status !== 'completed') {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: "UPI payment must complete before collecting cash",
            upiStatus: upiPayment.status
          });
        }
      }

      // Calculate change
      const received = receivedMinor || payment.amount_minor;
      const changeMinor = Math.max(0, received - payment.amount_minor);

      // Update cash payment to completed
      await client.query(
        `UPDATE payments.sell_payments
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1`,
        [paymentId]
      );

      // Check if all payments for this sale are completed
      const pendingPayments = await client.query(
        `SELECT COUNT(*) as pending FROM payments.sell_payments
         WHERE sale_id = $1 AND status != 'completed' AND is_split = true`,
        [payment.sale_id]
      );

      const pendingCount = parseInt(pendingPayments.rows[0]?.pending || '0', 10);

      if (pendingCount === 0) {
        // All payments complete - update sale status
        await client.query(
          `UPDATE public.sales SET status = 'completed' WHERE id = $1`,
          [payment.sale_id]
        );
      }

      await client.query("COMMIT");

      console.log(`[SM-013] Cash confirmed: paymentId=${paymentId}, change=${changeMinor}`);

      return res.json({
        status: 'completed',
        changeMinor,
        saleComplete: pendingCount === 0
      });

    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[SM-013] Confirm cash error:", err);
      return res.status(500).json({ error: "Failed to confirm cash payment" });
    } finally {
      client.release();
    }
  }
);

export default posPaymentsRouter;
