// SA-P0-006: Admin refund approval queue
import { randomUUID } from "crypto";
import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { supplierApprovalRateLimiter } from "../../../middleware/posRateLimiter";
import {
  recordSaleReturnMovements,
  type LedgerSaleItem,
} from "../../../services/inventoryLedgerService";
import { invalidateStockCache } from "../pos/inventory";

export const adminRefundsRouter = Router();

/**
 * GET /api/v1/admin/refunds/pending
 * List pending refund requests for SA approval
 */
adminRefundsRouter.get(
  "/refunds/pending",
  requireAdminToken,
  requirePermission("refunds", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const result = await pool.query(
        `SELECT r.id, r.original_sale_id, r.store_id, r.refund_type,
                r.amount_minor, r.reason, r.status, r.items,
                r.requested_by_device_id, r.created_at,
                s.bill_ref, s.total_minor AS sale_total_minor,
                s.status AS sale_status
         FROM refunds r
         JOIN sales s ON s.id = r.original_sale_id
         WHERE r.status = 'PENDING'
         ORDER BY r.created_at ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM refunds WHERE status = 'PENDING'`
      );

      return res.json({
        data: result.rows,
        total: countResult.rows[0]?.total ?? 0,
        limit,
        offset,
      });
    } catch (error) {
      console.error("[adminRefunds] GET /refunds/pending error:", error);
      return res.status(500).json({ error: "failed to fetch pending refunds" });
    }
  }
);

/**
 * GET /api/v1/admin/refunds
 * List all refunds (any status) with pagination
 */
adminRefundsRouter.get(
  "/refunds",
  requireAdminToken,
  requirePermission("refunds", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : null;

      const params: unknown[] = [limit, offset];
      let whereClause = "";
      if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
        whereClause = "WHERE r.status = $3";
        params.push(status);
      }

      const result = await pool.query(
        `SELECT r.id, r.original_sale_id, r.store_id, r.refund_type,
                r.amount_minor, r.reason, r.status, r.items,
                r.requested_by_device_id, r.approved_by, r.approved_at,
                r.rejection_reason, r.created_at, r.updated_at,
                s.bill_ref, s.total_minor AS sale_total_minor,
                s.status AS sale_status
         FROM refunds r
         JOIN sales s ON s.id = r.original_sale_id
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT $1 OFFSET $2`,
        params
      );

      return res.json({
        data: result.rows,
        total: result.rowCount ?? 0,
        limit,
        offset,
      });
    } catch (error) {
      console.error("[adminRefunds] GET /refunds error:", error);
      return res.status(500).json({ error: "failed to fetch refunds" });
    }
  }
);

/**
 * POST /api/v1/admin/refunds/:id/approve
 * SA approves a pending refund → inventory reversal + sale status update
 */
adminRefundsRouter.post(
  "/refunds/:id/approve",
  requireAdminToken,
  requirePermission("refunds", "approve"),
  supplierApprovalRateLimiter,
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { id } = req.params;
    const adminEmail = (req as any).adminInfo?.email ?? (req as any).adminId ?? "unknown";
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Lock the refund row
      const refundRes = await client.query(
        `SELECT r.id, r.original_sale_id, r.store_id, r.refund_type,
                r.amount_minor, r.reason, r.status, r.items
         FROM refunds r
         WHERE r.id = $1
         FOR UPDATE`,
        [id]
      );

      if (refundRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "refund not found" });
      }

      const refund = refundRes.rows[0];
      if (refund.status !== "PENDING") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: `refund already ${refund.status.toLowerCase()}` });
      }

      // Update refund status
      await client.query(
        `UPDATE refunds
         SET status = 'APPROVED', approved_by = $2, approved_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [id, adminEmail]
      );

      // Get sale items for inventory reversal
      const saleItemsRes = await client.query(
        `SELECT si.variant_id, si.quantity, si.price_minor, si.item_name AS name
         FROM sale_items si
         WHERE si.sale_id = $1`,
        [refund.original_sale_id]
      );

      // Determine which items to reverse
      let itemsToReverse: LedgerSaleItem[];
      if (refund.refund_type === "FULL") {
        // Full refund: reverse all items
        itemsToReverse = saleItemsRes.rows.map((row: any) => ({
          variantId: String(row.variant_id),
          quantity: Number(row.quantity),
          unitSellMinor: Number(row.price_minor),
          name: row.name ?? undefined,
        }));
      } else {
        // Partial refund: reverse only specified items
        const refundItems = Array.isArray(refund.items) ? refund.items : [];
        itemsToReverse = refundItems.map((ri: any) => ({
          variantId: String(ri.variantId),
          quantity: Number(ri.quantity),
          unitSellMinor: Number(ri.priceMinor),
          name: ri.name ?? undefined,
        }));
      }

      // Record inventory reversal
      const returnId = randomUUID();
      if (itemsToReverse.length > 0) {
        await recordSaleReturnMovements({
          client,
          storeId: refund.store_id,
          saleId: refund.original_sale_id,
          returnId,
          items: itemsToReverse,
          reason: `Refund approved: ${refund.reason}`,
        });
      }

      // Update sale status to REFUNDED
      await client.query(
        `UPDATE sales SET status = 'REFUNDED', updated_at = NOW() WHERE id = $1`,
        [refund.original_sale_id]
      );

      // Update AR record if exists
      await client.query(
        `UPDATE accounts_receivable
         SET status = 'written_off', updated_at = NOW()
         WHERE sale_id = $1 AND status != 'written_off'`,
        [refund.original_sale_id]
      );

      await client.query("COMMIT");

      // Invalidate stock cache after commit
      try {
        invalidateStockCache(refund.store_id);
      } catch (_) {
        // Non-critical
      }

      // Audit log
      try {
        await pool.query(
          `INSERT INTO admin.audit_log (id, admin_email, action, entity_type, entity_id, details, created_at)
           VALUES ($1, $2, 'refund_approved', 'refund', $3, $4, NOW())`,
          [randomUUID(), adminEmail, id, JSON.stringify({
            saleId: refund.original_sale_id,
            refundType: refund.refund_type,
            amountMinor: refund.amount_minor,
            reason: refund.reason,
          })]
        );
      } catch (_) {
        // Audit log failure is non-critical
      }

      return res.json({
        success: true,
        refundId: id,
        returnId,
        approvedBy: adminEmail,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("[adminRefunds] POST /refunds/:id/approve error:", error);
      return res.status(500).json({ error: "failed to approve refund" });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/v1/admin/refunds/:id/reject
 * SA rejects a pending refund
 */
adminRefundsRouter.post(
  "/refunds/:id/reject",
  requireAdminToken,
  requirePermission("refunds", "reject"),
  supplierApprovalRateLimiter,
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { id } = req.params;
    const { reason } = req.body as { reason?: string };
    const adminEmail = (req as any).adminInfo?.email ?? (req as any).adminId ?? "unknown";

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return res.status(400).json({ error: "rejection reason is required (min 3 chars)" });
    }

    try {
      const result = await pool.query(
        `UPDATE refunds
         SET status = 'REJECTED', rejection_reason = $2, approved_by = $3,
             approved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'PENDING'
         RETURNING id, original_sale_id`,
        [id, reason.trim(), adminEmail]
      );

      if (result.rowCount === 0) {
        // Check if it exists but is not PENDING
        const check = await pool.query(`SELECT status FROM refunds WHERE id = $1`, [id]);
        if (check.rowCount === 0) {
          return res.status(404).json({ error: "refund not found" });
        }
        return res.status(409).json({ error: `refund already ${check.rows[0].status.toLowerCase()}` });
      }

      // Audit log
      try {
        await pool.query(
          `INSERT INTO admin.audit_log (id, admin_email, action, entity_type, entity_id, details, created_at)
           VALUES ($1, $2, 'refund_rejected', 'refund', $3, $4, NOW())`,
          [randomUUID(), adminEmail, id, JSON.stringify({
            saleId: result.rows[0].original_sale_id,
            rejectionReason: reason.trim(),
          })]
        );
      } catch (_) {
        // Non-critical
      }

      return res.json({
        success: true,
        refundId: id,
        rejectedBy: adminEmail,
      });
    } catch (error) {
      console.error("[adminRefunds] POST /refunds/:id/reject error:", error);
      return res.status(500).json({ error: "failed to reject refund" });
    }
  }
);
