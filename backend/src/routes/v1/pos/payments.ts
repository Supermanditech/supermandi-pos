// POS Payments Routes
// SM-010: SELL UPI Init API (Generate QR)
// SM-011: UPI Status Polling
// SM-012: Cash + DUE Payment APIs

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
// SM-010: SELL UPI Init API
// =============================================================================

/**
 * POST /api/v1/pos/payments/upi/init
 * Initialize UPI payment for a sale and generate QR code data
 *
 * Request: { saleId: string, amountMinor: number }
 * Response: { paymentId, orderId, qrData, upiVpa, expiresAt }
 */
posPaymentsRouter.post(
  "/payments/upi/init",
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
      const saleResult = await client.query(
        `SELECT s.id, s.store_id, s.total_minor, s.status, s.payment_mode
         FROM public.sales s
         WHERE s.id = $1::uuid AND s.store_id = $2::uuid`,
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
         WHERE sale_id = $1::uuid AND mode = 'UPI' AND status IN ('pending', 'initiated')
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
// SM-012: SELL Cash Payment API
// =============================================================================

/**
 * POST /api/v1/pos/payments/cash
 * Record a cash payment for a sale
 *
 * Request: { saleId, amountMinor, receivedMinor }
 * Response: { paymentId, status, changeMinor }
 */
posPaymentsRouter.post(
  "/payments/cash",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;
    const { saleId, amountMinor, receivedMinor } = req.body;

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

      // Verify sale exists and is not already paid
      const saleResult = await client.query(
        `SELECT id, status, payment_mode FROM public.sales WHERE id = $1::uuid AND store_id = $2::uuid`,
        [saleId, storeId]
      );

      if (saleResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Sale not found" });
      }

      const sale = saleResult.rows[0];
      if (sale.status === 'completed') {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Sale is already completed" });
      }

      // Calculate change
      const received = receivedMinor || amountMinor;
      const changeMinor = Math.max(0, received - amountMinor);

      // Create payment record
      const paymentId = randomUUID();
      await client.query(
        `INSERT INTO payments.sell_payments (
          id, sale_id, store_id, mode, amount_minor, status, completed_at
        ) VALUES ($1, $2, $3, 'CASH', $4, 'completed', NOW())`,
        [paymentId, saleId, storeId, amountMinor]
      );

      // Update sale status
      await client.query(
        `UPDATE public.sales SET status = 'completed', payment_mode = 'CASH' WHERE id = $1`,
        [saleId]
      );

      await client.query("COMMIT");

      return res.json({
        paymentId,
        status: 'completed',
        changeMinor
      });

    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[SM-012] Cash payment error:", err);
      return res.status(500).json({ error: "Failed to process cash payment" });
    } finally {
      client.release();
    }
  }
);

// =============================================================================
// SM-012: SELL DUE Payment API
// =============================================================================

/**
 * POST /api/v1/pos/payments/due
 * Record a DUE (credit) payment for a sale
 *
 * Request: { saleId, amountMinor, customerName, customerPhone, dueDate? }
 * Response: { paymentId, dueId, status }
 */
posPaymentsRouter.post(
  "/payments/due",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;
    const { saleId, amountMinor, customerName, customerPhone, dueDate } = req.body;

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

      // Verify sale exists and is not already paid
      const saleResult = await client.query(
        `SELECT id, status, payment_mode FROM public.sales WHERE id = $1::uuid AND store_id = $2::uuid`,
        [saleId, storeId]
      );

      if (saleResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Sale not found" });
      }

      const sale = saleResult.rows[0];
      if (sale.status === 'completed') {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Sale is already completed" });
      }

      // Create payment record
      const paymentId = randomUUID();
      await client.query(
        `INSERT INTO payments.sell_payments (
          id, sale_id, store_id, mode, amount_minor, status, initiated_at
        ) VALUES ($1, $2, $3, 'DUE', $4, 'pending', NOW())`,
        [paymentId, saleId, storeId, amountMinor]
      );

      // Create customer due record
      const dueId = randomUUID();
      await client.query(
        `INSERT INTO payments.customer_dues (
          id, store_id, sale_id, customer_name, customer_phone, amount_minor, status, due_date
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
        [dueId, storeId, saleId, customerName || null, customerPhone || null, amountMinor, dueDate || null]
      );

      // Update sale status
      await client.query(
        `UPDATE public.sales SET status = 'completed', payment_mode = 'DUE' WHERE id = $1`,
        [saleId]
      );

      await client.query("COMMIT");

      return res.json({
        paymentId,
        dueId,
        status: 'pending'
      });

    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[SM-012] DUE payment error:", err);
      return res.status(500).json({ error: "Failed to process DUE payment" });
    } finally {
      client.release();
    }
  }
);

export default posPaymentsRouter;
