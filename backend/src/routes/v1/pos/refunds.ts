/**
 * T-150: Payment Refund Flow
 *
 * Endpoints:
 *   POST /api/v1/pos/payments/refund — Create refund request
 *   GET  /api/v1/pos/refunds         — List refunds for store
 *   GET  /api/v1/pos/refunds/:id     — Get refund detail
 *
 * Business rules:
 *   - Sale must exist and belong to JWT store
 *   - Refund amount <= sale total
 *   - Cash refunds auto-approve (status='processed')
 *   - UPI refunds = 'pending' (manual processing)
 *   - If items provided, reverse stock via inventory_ledger pattern
 *   - All money in BIGINT (paise)
 *   - Store isolation: JWT store_id only
 */

import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { financialOperationsRateLimiter } from "../../../middleware/posRateLimiter";
import { log } from "../../../lib/logger";

export const posRefundsRouter = Router();

// Extended request type with posDevice from middleware
interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

// Maximum refund amount validation (same as MAX_PAYMENT_AMOUNT)
const MAX_REFUND_AMOUNT = 1_000_000_000; // ₹10 crore in paise

// =============================================================================
// POST /api/v1/pos/payments/refund — Create refund request
// =============================================================================

interface RefundItemInput {
  productId: string;
  quantity: number;
}

interface RefundRequestBody {
  saleId: string;
  refundAmountMinor: number;
  refundMethod: 'cash' | 'upi' | 'khata' | 'adjustment';
  reason: string;
  items?: RefundItemInput[];
}

posRefundsRouter.post(
  "/payments/refund",
  requireDeviceToken,
  requireActiveStore,
  financialOperationsRateLimiter,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId, deviceId } = (req as unknown as PosRequest).posDevice;
    const {
      saleId,
      refundAmountMinor,
      refundMethod,
      reason,
      items,
    } = req.body as RefundRequestBody;

    // Validate required fields
    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "saleId is required" } });
    }
    if (!refundAmountMinor || typeof refundAmountMinor !== 'number' || refundAmountMinor <= 0) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "refundAmountMinor must be a positive number" } });
    }
    if (refundAmountMinor > MAX_REFUND_AMOUNT) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Refund amount exceeds maximum limit" } });
    }
    if (!Number.isInteger(refundAmountMinor)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "refundAmountMinor must be an integer (paise)" } });
    }

    const validMethods = ['cash', 'upi', 'khata', 'adjustment'];
    if (!refundMethod || !validMethods.includes(refundMethod)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: `refundMethod must be one of: ${validMethods.join(', ')}` }
      });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "reason is required (minimum 3 characters)" }
      });
    }

    // Validate items if provided
    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "items must be a non-empty array if provided" }
        });
      }
      for (const item of items) {
        if (!item.productId || typeof item.productId !== 'string') {
          return res.status(400).json({
            error: { code: "VALIDATION_ERROR", message: "Each item must have a valid productId" }
          });
        }
        if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
          return res.status(400).json({
            error: { code: "VALIDATION_ERROR", message: "Each item must have a positive integer quantity" }
          });
        }
      }
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Verify sale exists and belongs to this store
      const saleResult = await client.query(
        `SELECT s.id, s.store_id, s.total_minor, s.status
         FROM public.sales s
         WHERE s.id = $1 AND s.store_id = $2::uuid
         FOR UPDATE`,
        [saleId, storeId]
      );

      if (saleResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          error: { code: "SALE_NOT_FOUND", message: "Sale not found or does not belong to this store" }
        });
      }

      const sale = saleResult.rows[0];

      // 2. Validate refund amount doesn't exceed sale total
      // Check existing refunds for this sale to prevent over-refunding
      const existingRefundsResult = await client.query(
        `SELECT COALESCE(SUM(refund_amount_minor), 0)::bigint as total_refunded
         FROM orders.refunds
         WHERE sale_id = $1 AND store_id = $2 AND status NOT IN ('rejected')`,
        [saleId, storeId]
      );
      const totalRefunded = parseInt(existingRefundsResult.rows[0]?.total_refunded || '0', 10);
      const remainingRefundable = sale.total_minor - totalRefunded;

      if (refundAmountMinor > remainingRefundable) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: {
            code: "REFUND_EXCEEDS_TOTAL",
            message: `Refund amount (${refundAmountMinor}) exceeds refundable amount (${remainingRefundable}). Sale total: ${sale.total_minor}, already refunded: ${totalRefunded}.`
          }
        });
      }

      // 3. Determine initial status based on refund method
      // Cash refunds are auto-approved (instant at counter)
      // UPI refunds need manual processing
      const initialStatus = refundMethod === 'cash' ? 'processed' : 'pending';
      const processedAt = initialStatus === 'processed' ? 'NOW()' : 'NULL';

      // 4. Create refund record
      const refundId = randomUUID();
      const itemsJson = items ? JSON.stringify(items) : null;

      await client.query(
        `INSERT INTO orders.refunds (
          id, store_id, sale_id, refund_amount_minor,
          status, refund_method, reason, items,
          processed_at, created_at, updated_at
        ) VALUES (
          $1, $2::uuid, $3, $4,
          $5, $6, $7, $8::jsonb,
          ${initialStatus === 'processed' ? 'NOW()' : 'NULL'}, NOW(), NOW()
        )`,
        [refundId, storeId, saleId, refundAmountMinor, initialStatus, refundMethod, reason.trim(), itemsJson]
      );

      // 5. If items provided, reverse stock (add back to inventory)
      if (items && items.length > 0) {
        // Sort items by productId to prevent deadlocks
        const sortedItems = [...items].sort((a, b) => a.productId.localeCompare(b.productId));

        for (const item of sortedItems) {
          const deltaQty = Math.abs(item.quantity); // Positive delta = adding stock back

          // Get current stock balance
          const balanceResult = await client.query(
            `SELECT current_qty FROM inventory.stock_balances
             WHERE store_id = $1 AND product_id = $2
             FOR UPDATE`,
            [storeId, item.productId]
          );

          const stockBefore = Number(balanceResult.rows[0]?.current_qty ?? 0);
          const stockAfter = stockBefore + deltaQty;

          // Find original sale ledger entry for reversal chain tracking
          const originalLedgerRes = await client.query(
            `SELECT id FROM inventory.inventory_ledger
             WHERE store_id = $1 AND product_id = $2
               AND reference_type = 'sale' AND reference_id = $3
               AND transaction_type = 'sale'
             ORDER BY created_at DESC LIMIT 1`,
            [storeId, item.productId, saleId]
          );
          const originalLedgerId = originalLedgerRes.rows[0]?.id ?? null;

          // Create ledger entry for stock reversal
          const ledgerId = randomUUID();
          await client.query(
            `INSERT INTO inventory.inventory_ledger
             (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id,
              stock_before, stock_after, source, notes, reversal_of_id)
             VALUES ($1, $2, $3, $4, 'sale_return', 'refund', $5, $6, $7, 'REFUND_SERVICE', $8, $9)`,
            [
              ledgerId,
              storeId,
              item.productId,
              deltaQty,
              refundId,
              stockBefore,
              stockAfter,
              `Refund for sale ${saleId}: ${reason.trim()}`,
              originalLedgerId,
            ]
          );

          // Update stock_balances
          await client.query(
            `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (store_id, product_id) DO UPDATE SET
               current_qty = inventory.stock_balances.current_qty + $5,
               last_ledger_id = $4,
               updated_at = NOW()`,
            [storeId, item.productId, stockAfter, ledgerId, deltaQty]
          );

          // Update denormalized stock in store_products
          await client.query(
            `UPDATE catalog.store_products
             SET current_stock = current_stock + $3, updated_at = NOW()
             WHERE store_id = $1 AND product_id = $2 AND is_active = true`,
            [storeId, item.productId, deltaQty]
          );

          // Mark original ledger entry as reversed (if found)
          if (originalLedgerId) {
            await client.query(
              `UPDATE inventory.inventory_ledger
               SET is_reversed = true, reversed_by_id = $2, updated_at = NOW()
               WHERE id = $1`,
              [originalLedgerId, ledgerId]
            );
          }
        }
      }

      await client.query("COMMIT");

      log.info(`[T-150] Refund created: refundId=${refundId}, saleId=${saleId}, amount=${refundAmountMinor}, method=${refundMethod}, status=${initialStatus}`);

      return res.status(201).json({
        success: true,
        refund: {
          id: refundId,
          saleId,
          storeId,
          refundAmountMinor,
          refundMethod,
          status: initialStatus,
          reason: reason.trim(),
          items: items || null,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      await client.query("ROLLBACK");
      log.error("[T-150] Refund creation error:", err);

      if (err.code === '23503') {
        return res.status(400).json({
          error: { code: "REFERENCE_ERROR", message: "Referenced sale or store does not exist" }
        });
      }

      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to create refund" }
      });
    } finally {
      client.release();
    }
  }
);

// =============================================================================
// GET /api/v1/pos/refunds — List refunds for store
// =============================================================================

posRefundsRouter.get(
  "/refunds",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const saleId = typeof req.query.saleId === 'string' ? req.query.saleId.trim() : undefined;

    try {
      const conditions: string[] = ['r.store_id = $1::uuid'];
      const params: unknown[] = [storeId];
      let paramIdx = 2;

      if (status) {
        const validStatuses = ['pending', 'approved', 'processed', 'rejected'];
        if (validStatuses.includes(status)) {
          conditions.push(`r.status = $${paramIdx++}`);
          params.push(status);
        }
      }

      if (saleId) {
        conditions.push(`r.sale_id = $${paramIdx++}`);
        params.push(saleId);
      }

      const whereClause = conditions.join(' AND ');

      const [countResult, result] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int as total FROM orders.refunds r WHERE ${whereClause}`,
          params
        ),
        pool.query(
          `SELECT
            r.id,
            r.sale_id as "saleId",
            r.refund_amount_minor as "refundAmountMinor",
            r.status,
            r.refund_method as "refundMethod",
            r.reason,
            r.items,
            r.processed_at as "processedAt",
            r.created_at as "createdAt",
            r.updated_at as "updatedAt"
          FROM orders.refunds r
          WHERE ${whereClause}
          ORDER BY r.created_at DESC
          LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          [...params, limit, offset]
        ),
      ]);

      const total = countResult.rows[0]?.total ?? 0;

      return res.json({
        success: true,
        data: result.rows,
        total,
        limit,
        offset,
      });
    } catch (err: any) {
      log.error("[T-150] List refunds error:", err);

      // Handle table not existing yet (migration may not have run)
      if (err.code === '42P01') {
        return res.json({ success: true, data: [], total: 0, limit, offset });
      }

      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to list refunds" }
      });
    }
  }
);

// =============================================================================
// GET /api/v1/pos/refunds/:id — Get refund detail
// =============================================================================

posRefundsRouter.get(
  "/refunds/:id",
  requireDeviceToken,
  async (req: Request, res: Response, _next: NextFunction) => {
    const { storeId } = (req as unknown as PosRequest).posDevice;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Refund ID is required" } });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
    }

    try {
      // Get refund with store isolation
      const result = await pool.query(
        `SELECT
          r.id,
          r.sale_id as "saleId",
          r.store_id as "storeId",
          r.original_payment_id as "originalPaymentId",
          r.refund_amount_minor as "refundAmountMinor",
          r.status,
          r.refund_method as "refundMethod",
          r.reason,
          r.items,
          r.processed_by as "processedBy",
          r.processed_at as "processedAt",
          r.created_at as "createdAt",
          r.updated_at as "updatedAt"
        FROM orders.refunds r
        WHERE r.id = $1::uuid AND r.store_id = $2::uuid`,
        [id, storeId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: "Refund not found" }
        });
      }

      const refund = result.rows[0];

      // Get related sale info
      let saleInfo = null;
      try {
        const saleResult = await pool.query(
          `SELECT id, bill_ref as "billRef", total_minor as "totalMinor", status, created_at as "createdAt"
           FROM public.sales
           WHERE id = $1 AND store_id = $2::uuid`,
          [refund.saleId, storeId]
        );
        saleInfo = saleResult.rows[0] || null;
      } catch {
        // Non-critical
      }

      // Get inventory movements created by this refund
      let stockMovements: any[] = [];
      try {
        const movementsResult = await pool.query(
          `SELECT
            il.product_id as "productId",
            il.delta_qty as "deltaQty",
            il.stock_before as "stockBefore",
            il.stock_after as "stockAfter",
            il.created_at as "createdAt"
          FROM inventory.inventory_ledger il
          WHERE il.store_id = $1 AND il.reference_id = $2 AND il.reference_type = 'refund'
          ORDER BY il.created_at`,
          [storeId, id]
        );
        stockMovements = movementsResult.rows;
      } catch {
        // Non-critical
      }

      return res.json({
        success: true,
        refund,
        sale: saleInfo,
        stockMovements,
      });
    } catch (err: any) {
      log.error("[T-150] Get refund detail error:", err);

      if (err.code === '42P01') {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: "Refund not found" }
        });
      }

      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to get refund details" }
      });
    }
  }
);
