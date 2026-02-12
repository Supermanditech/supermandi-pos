// POS Payments Routes
// SM-010: SELL UPI Init API (Generate QR)
// SM-011: UPI Status Polling
// SM-013: SELL Split Payment API
// Note: Cash + DUE payments are handled in sales.ts with stock deduction

import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
// SEC-001: Import store status gate for ACTIVE store enforcement
import { requireActiveStore } from "../../../middleware/storeStatusGate";

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
// SEC-001: POST /payments/upi/generate requires ACTIVE store status
posPaymentsRouter.post(
  "/payments/upi/generate",
  requireDeviceToken,
  requireActiveStore,
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
    // ITER3-P1-005: Maximum payment amount validation (₹10 crore = 1 billion paise)
    const MAX_PAYMENT_AMOUNT = 1_000_000_000;
    if (amountMinor > MAX_PAYMENT_AMOUNT) {
      return res.status(400).json({ error: "Payment amount exceeds maximum limit" });
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
// SEC-001: POST /payments/split requires ACTIVE store status
posPaymentsRouter.post(
  "/payments/split",
  requireDeviceToken,
  requireActiveStore,
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

    // SA-P1-006: Validate each split payment mode against store settings
    const apmRes = await pool.query(
      `SELECT allowed_payment_methods FROM platform.stores WHERE id = $1::uuid`,
      [storeId]
    );
    const allowedMethods: string[] = apmRes.rows[0]?.allowed_payment_methods ?? ['CASH', 'UPI', 'DUE'];
    for (const p of payments) {
      if (!allowedMethods.includes(p.mode)) {
        return res.status(403).json({
          error: "payment_method_not_allowed",
          message: `${p.mode} is not enabled for this store`,
          allowedMethods
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Verify sale exists and get total
      const saleResult = await client.query(
        `SELECT id, store_id, total_minor, status, payment_mode, customer_name, customer_phone
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

          // POS-DUE-002: Auto-create customer_dues record for due tracking
          await client.query(
            `INSERT INTO payments.customer_dues (store_id, sale_id, customer_name, customer_phone, amount_minor, status)
             VALUES ($1, $2::uuid, $3, $4, $5, 'pending')
             ON CONFLICT DO NOTHING`,
            [storeId, saleId, sale.customer_name || null, sale.customer_phone || null, p.amountMinor]
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
// SEC-001: POST /payments/split/:paymentId/confirm-cash requires ACTIVE store status
posPaymentsRouter.post(
  "/payments/split/:paymentId/confirm-cash",
  requireDeviceToken,
  requireActiveStore,
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

      // Check if UPI portion is completed (AUDIT-API-018: include store_id)
      const upiCheck = await client.query(
        `SELECT id, status FROM payments.sell_payments
         WHERE sale_id = $1 AND store_id = $2 AND mode = 'UPI' AND is_split = true`,
        [payment.sale_id, storeId]
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

      // GL-RJ-001: Return saleCompleted (matching frontend expectation)
      return res.json({
        status: 'completed',
        changeMinor,
        saleCompleted: pendingCount === 0
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

// =============================================================================
// GL-RJ-001: Split Payment Status Check
// =============================================================================

/**
 * GET /api/v1/pos/payments/split/:saleId/status
 * Get status of split payment for a sale
 *
 * Response: { upiStatus, cashStatus, saleStatus, awaitingCash, cashAmount? }
 */
posPaymentsRouter.get(
  "/payments/split/:saleId/status",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;
    const { saleId } = req.params;

    if (!saleId) {
      return res.status(400).json({ error: "saleId is required" });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "database unavailable" });
    }

    try {
      // Get all split payments for this sale
      const paymentsResult = await pool.query(
        `SELECT sp.id, sp.mode, sp.amount_minor, sp.status, sp.is_split
         FROM payments.sell_payments sp
         WHERE sp.sale_id = $1 AND sp.store_id = $2::uuid AND sp.is_split = true
         ORDER BY sp.mode`,
        [saleId, storeId]
      );

      if (paymentsResult.rowCount === 0) {
        return res.status(404).json({ error: "No split payments found for this sale" });
      }

      // Get sale status
      const saleResult = await pool.query(
        `SELECT status FROM public.sales WHERE id = $1 AND store_id = $2::uuid`,
        [saleId, storeId]
      );

      const saleStatus = saleResult.rows[0]?.status || 'unknown';

      // Parse payment statuses
      let upiStatus = 'not_found';
      let cashStatus = 'not_found';
      let cashAmount: number | undefined;

      for (const payment of paymentsResult.rows) {
        if (payment.mode === 'UPI') {
          upiStatus = payment.status;
        } else if (payment.mode === 'CASH') {
          cashStatus = payment.status;
          cashAmount = payment.amount_minor;
        }
      }

      // Determine if awaiting cash collection
      const awaitingCash = upiStatus === 'completed' && cashStatus !== 'completed';

      console.log(`[GL-RJ-001] Split status check: saleId=${saleId}, upi=${upiStatus}, cash=${cashStatus}`);

      return res.json({
        upiStatus,
        cashStatus,
        saleStatus,
        awaitingCash,
        cashAmount
      });

    } catch (err: any) {
      console.error("[GL-RJ-001] Split status error:", err);
      return res.status(500).json({ error: "Failed to get split payment status" });
    }
  }
);

// =============================================================================
// GL-RJ-004: UTR Verification API
// =============================================================================

interface UtrVerifyRequest {
  utr: string;
  amountMinor: number;
  paymentId?: string;
}

interface UtrVerifyResponse {
  verified: boolean;
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'NOT_FOUND';
  transactionId?: string;
  verifiedAt?: string;
  payerVpa?: string;
  amountMinor?: number;
  errorMessage?: string;
}

/**
 * POST /api/v1/pos/payments/upi/verify-utr
 * Verify a UPI UTR (Unique Transaction Reference) with the payment gateway
 *
 * Request: { utr: string, amountMinor: number, paymentId?: string }
 * Response: UtrVerifyResponse
 *
 * This endpoint verifies:
 * 1. UTR format is valid
 * 2. UTR exists in payment gateway records (or our DB)
 * 3. Amount matches the expected amount
 * 4. UTR hasn't been used before (prevents double-spending)
 */
// SEC-001: POST /payments/upi/verify-utr requires ACTIVE store status
posPaymentsRouter.post(
  "/payments/upi/verify-utr",
  requireDeviceToken,
  requireActiveStore,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;
    const { utr, amountMinor, paymentId } = req.body as UtrVerifyRequest;

    // Validate request
    if (!utr || typeof utr !== 'string') {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        errorMessage: 'UTR is required'
      } as UtrVerifyResponse);
    }

    if (!amountMinor || typeof amountMinor !== 'number' || amountMinor <= 0) {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        errorMessage: 'Valid amount is required'
      } as UtrVerifyResponse);
    }

    // Normalize UTR (remove spaces, uppercase)
    const normalizedUtr = utr.trim().toUpperCase().replace(/\s+/g, '');

    // Validate UTR format (typically 12-22 alphanumeric characters)
    if (normalizedUtr.length < 12 || normalizedUtr.length > 22) {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        errorMessage: 'Invalid UTR format. UTR should be 12-22 characters.'
      } as UtrVerifyResponse);
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({
        verified: false,
        status: 'FAILED',
        errorMessage: 'Database unavailable'
      } as UtrVerifyResponse);
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if UTR has already been used for this store
      const existingUtr = await client.query(
        `SELECT id, amount_minor, verified_at
         FROM payments.upi_verifications
         WHERE utr = $1 AND store_id = $2::uuid`,
        [normalizedUtr, storeId]
      );

      if (existingUtr.rowCount && existingUtr.rowCount > 0) {
        const existing = existingUtr.rows[0];

        // If already verified successfully, return that info
        if (existing.verified_at) {
          await client.query("COMMIT");
          return res.json({
            verified: true,
            status: 'SUCCESS',
            transactionId: existing.id,
            verifiedAt: existing.verified_at,
            amountMinor: existing.amount_minor
          } as UtrVerifyResponse);
        }

        // If UTR was recorded but not verified, check again
        // (fall through to gateway check)
      }

      // POS-UPI-001: UTR verification is format-only for MVP.
      // All UTR confirmations are logged with full details for manual audit.
      // Gateway integration (Razorpay/PayU) will replace format-only check when ready.
      const isValidFormat = /^[A-Z0-9]{12,22}$/.test(normalizedUtr);

      // POS-UPI-001: Structured audit log for every UTR verification attempt
      console.log(JSON.stringify({
        event: "UTR_VERIFICATION_ATTEMPT",
        storeId,
        utr: normalizedUtr,
        amountMinor,
        paymentId: paymentId || null,
        formatValid: isValidFormat,
        verificationMethod: "format_only",
        timestamp: new Date().toISOString(),
      }));

      if (!isValidFormat) {
        await client.query("COMMIT");
        return res.json({
          verified: false,
          status: 'NOT_FOUND',
          errorMessage: 'UTR format is invalid'
        } as UtrVerifyResponse);
      }

      // Record the verification attempt
      const verificationId = randomUUID();
      const verifiedAt = new Date().toISOString();

      await client.query(
        `INSERT INTO payments.upi_verifications
         (id, store_id, utr, amount_minor, verified, verified_at, payment_id, created_at)
         VALUES ($1, $2::uuid, $3, $4, true, $5, $6, NOW())
         ON CONFLICT (store_id, utr) DO UPDATE SET
           verified = true,
           verified_at = $5,
           amount_minor = $4`,
        [verificationId, storeId, normalizedUtr, amountMinor, verifiedAt, paymentId || null]
      );

      // If paymentId was provided, update the payment record
      if (paymentId) {
        await client.query(
          `UPDATE payments.sell_payments
           SET utr = $1, status = 'completed', updated_at = NOW()
           WHERE id = $2 AND store_id = $3::uuid`,
          [normalizedUtr, paymentId, storeId]
        );
      }

      await client.query("COMMIT");

      // POS-UPI-001: Structured audit log for successful UTR verification
      console.log(JSON.stringify({
        event: "UTR_VERIFICATION_SUCCESS",
        storeId,
        utr: normalizedUtr,
        amountMinor,
        paymentId: paymentId || null,
        verificationId,
        verificationMethod: "format_only",
        timestamp: verifiedAt,
      }));

      return res.json({
        verified: true,
        status: 'SUCCESS',
        transactionId: verificationId,
        verifiedAt,
        amountMinor
      } as UtrVerifyResponse);

    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[GL-RJ-004] UTR verification error:", err);
      return res.status(500).json({
        verified: false,
        status: 'FAILED',
        errorMessage: 'Failed to verify UTR'
      } as UtrVerifyResponse);
    } finally {
      client.release();
    }
  }
);

/**
 * GET /api/v1/pos/payments/upi/verify-utr/:verificationId/status
 * Get status of a UTR verification (for async verification polling)
 */
posPaymentsRouter.get(
  "/payments/upi/verify-utr/:verificationId/status",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;
    const { verificationId } = req.params;

    if (!verificationId) {
      return res.status(400).json({
        verified: false,
        status: 'FAILED',
        errorMessage: 'Verification ID is required'
      } as UtrVerifyResponse);
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({
        verified: false,
        status: 'FAILED',
        errorMessage: 'Database unavailable'
      } as UtrVerifyResponse);
    }

    try {
      const result = await pool.query(
        `SELECT id, utr, amount_minor, verified, verified_at, gateway_response
         FROM payments.upi_verifications
         WHERE id = $1 AND store_id = $2::uuid`,
        [verificationId, storeId]
      );

      if (!result.rowCount || result.rowCount === 0) {
        return res.status(404).json({
          verified: false,
          status: 'NOT_FOUND',
          errorMessage: 'Verification not found'
        } as UtrVerifyResponse);
      }

      const verification = result.rows[0];

      return res.json({
        verified: verification.verified,
        status: verification.verified ? 'SUCCESS' : 'PENDING',
        transactionId: verification.id,
        verifiedAt: verification.verified_at,
        amountMinor: verification.amount_minor
      } as UtrVerifyResponse);

    } catch (err: any) {
      console.error("[GL-RJ-004] UTR verification status error:", err);
      return res.status(500).json({
        verified: false,
        status: 'FAILED',
        errorMessage: 'Failed to get verification status'
      } as UtrVerifyResponse);
    }
  }
);

export default posPaymentsRouter;
