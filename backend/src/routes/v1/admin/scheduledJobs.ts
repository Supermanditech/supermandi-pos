/**
 * Phase 8: Scheduled Jobs Endpoints
 * T-231: Payment reminder scheduler
 * T-223: Health check for monitoring
 *
 * These endpoints are called by Cloud Scheduler or admin manually.
 * Protected by admin token.
 */

import { Router, Request, Response } from 'express';
import { requireAdminToken } from '../../../middleware/adminToken';
import { processOverdueReminders } from '../../../services/paymentReminderService';
import { detectAnomalies } from '../../../services/ai/anomalyAlertingService';
import { getPool } from '../../../db/client';
import { log } from "../../../lib/logger";

export const adminScheduledJobsRouter = Router();

adminScheduledJobsRouter.use(requireAdminToken);

// POST /admin/jobs/payment-reminders — Process overdue payment reminders
// Called by Cloud Scheduler daily at 9 AM IST
adminScheduledJobsRouter.post('/jobs/payment-reminders', async (_req: Request, res: Response) => {
  try {
    const result = await processOverdueReminders();
    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    log.error('[Scheduled Jobs] Payment reminder error:', err);
    return res.status(500).json({ error: 'Payment reminder processing failed' });
  }
});

// GET /admin/jobs/payment-reminders/history — Get reminder history
adminScheduledJobsRouter.get('/jobs/payment-reminders/history', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const storeId = req.query.storeId as string | undefined;

  try {
    let query = `
      SELECT pr.*, s.name AS store_name
      FROM orders.payment_reminders pr
      LEFT JOIN platform.stores s ON s.id = pr.store_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (storeId) {
      query += ` AND pr.store_id = $${paramIdx++}::uuid`;
      params.push(storeId);
    }

    query += ` ORDER BY pr.sent_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        storeId: r.store_id,
        storeName: r.store_name,
        customerPhone: r.customer_phone,
        customerName: r.customer_name,
        totalOverdueAmount: r.total_overdue_amount,
        overdueCount: r.overdue_count,
        oldestDueDate: r.oldest_due_date,
        reminderNumber: r.reminder_number,
        channel: r.channel,
        status: r.status,
        sentAt: r.sent_at,
      })),
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
      return res.json({ success: true, data: [] });
    }
    log.error('[Scheduled Jobs] Reminder history error:', err);
    return res.status(500).json({ error: 'Failed to fetch reminder history' });
  }
});

// POST /admin/jobs/anomaly-detection — Run anomaly detection across all stores
// Called by Cloud Scheduler hourly
adminScheduledJobsRouter.post('/jobs/anomaly-detection', async (_req: Request, res: Response) => {
  try {
    const result = await detectAnomalies();
    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    log.error('[Scheduled Jobs] Anomaly detection error:', err);
    return res.status(500).json({ error: 'Anomaly detection processing failed' });
  }
});

// POST /admin/jobs/token-cleanup — Clean up expired/invalid FCM tokens
adminScheduledJobsRouter.post('/jobs/token-cleanup', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    // Deactivate tokens not used in 90 days
    const result = await pool.query(`
      UPDATE auth.device_tokens
      SET is_active = false, updated_at = NOW()
      WHERE is_active = true AND last_used_at < NOW() - INTERVAL '90 days'
    `);

    // Delete tokens inactive for 180+ days
    const deleteResult = await pool.query(`
      DELETE FROM auth.device_tokens
      WHERE is_active = false AND updated_at < NOW() - INTERVAL '180 days'
    `);

    return res.json({
      success: true,
      deactivated: result.rowCount ?? 0,
      deleted: deleteResult.rowCount ?? 0,
    });
  } catch (err) {
    log.error('[Scheduled Jobs] Token cleanup error:', err);
    return res.status(500).json({ error: 'Token cleanup failed' });
  }
});

// POST /admin/jobs/reorder-trigger-check — Scan all stores for low stock vs reorder policies
// Called by Cloud Scheduler (e.g. daily) or manually by admin
// GCP-STG-0375: Auto-reorder trigger — monitors stock vs reorder policies
adminScheduledJobsRouter.post('/jobs/reorder-trigger-check', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const startedAt = new Date();
  let totalEvaluated = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  const storeResults: Array<{ storeId: string; evaluated: number; created: number; skipped: number }> = [];

  try {
    // Step 1: Get all stores with reorder_enabled = true
    const storesResult = await pool.query(
      `SELECT store_id FROM reorder.store_reorder_settings WHERE reorder_enabled = true`
    );

    for (const storeRow of storesResult.rows) {
      const storeId = storeRow.store_id;
      let storeEvaluated = 0;
      let storeCreated = 0;
      let storeSkipped = 0;

      // Step 2: Find products where current stock <= min_stock threshold
      // and no existing pending reorder for the same store+product
      const lowStockResult = await pool.query(
        `SELECT
          rp.store_id,
          rp.product_id,
          COALESCE(sp.display_name, p.name, 'Unknown Product') AS product_name,
          p.primary_barcode AS barcode,
          COALESCE(sb.current_qty, sp.current_stock, 0)::int AS current_stock,
          rp.min_stock,
          rp.target_stock,
          rp.max_reorder_qty,
          rp.preferred_supplier_id
        FROM reorder.reorder_policies rp
        JOIN catalog.store_products sp ON sp.store_id = rp.store_id AND sp.product_id = rp.product_id
        JOIN catalog.products p ON p.id = rp.product_id
        LEFT JOIN inventory.stock_balances sb ON sb.store_id = rp.store_id AND sb.product_id = rp.product_id
        WHERE rp.store_id = $1
          AND rp.is_enabled = true
          AND COALESCE(sb.current_qty, sp.current_stock, 0) <= rp.min_stock
          AND NOT EXISTS (
            SELECT 1 FROM reorder.pending_reorders pr
            WHERE pr.store_id = rp.store_id
              AND pr.product_id = rp.product_id
              AND pr.status = 'pending'
          )`,
        [storeId]
      );

      storeEvaluated = lowStockResult.rows.length;

      // Step 3: Insert pending reorders for each low-stock product
      for (const row of lowStockResult.rows) {
        const suggestedQty = Math.max(1, row.target_stock - row.current_stock);
        const cappedQty = row.max_reorder_qty
          ? Math.min(suggestedQty, row.max_reorder_qty)
          : suggestedQty;

        // Look up supplier product for price + supplier_product_id
        let suggestedUnitPrice: number | null = null;
        let supplierProductId: string | null = null;
        if (row.preferred_supplier_id) {
          const spResult = await pool.query(
            `SELECT id, unit_price FROM catalog.supplier_products
             WHERE supplier_id = $1 AND product_id = $2 AND is_active = true
             LIMIT 1`,
            [row.preferred_supplier_id, row.product_id]
          );
          if (spResult.rows.length > 0) {
            supplierProductId = spResult.rows[0].id;
            suggestedUnitPrice = spResult.rows[0].unit_price;
          }
        }

        try {
          await pool.query(
            `INSERT INTO reorder.pending_reorders (
              store_id, product_id, product_name, barcode,
              current_stock, min_threshold, target_stock,
              suggested_quantity, suggested_supplier_id,
              suggested_unit_price, supplier_product_id,
              status, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', NOW() + INTERVAL '7 days')
            ON CONFLICT DO NOTHING`,
            [
              row.store_id, row.product_id, row.product_name, row.barcode,
              row.current_stock, row.min_stock, row.target_stock,
              cappedQty, row.preferred_supplier_id,
              suggestedUnitPrice, supplierProductId,
            ]
          );
          storeCreated++;
        } catch (insertErr) {
          // Unique constraint violation = already exists (race condition), skip
          storeSkipped++;
        }
      }

      // Step 4: Log run to reorder_runs
      try {
        await pool.query(
          `INSERT INTO reorder.reorder_runs (store_id, run_type, started_at, finished_at, evaluated_products, created_pending, skipped_existing, status)
           VALUES ($1, 'cron', $2, NOW(), $3, $4, $5, 'success')`,
          [storeId, startedAt, storeEvaluated, storeCreated, storeSkipped]
        );
      } catch (runLogErr) {
        log.error('[ReorderTrigger] Failed to log reorder run:', runLogErr);
      }

      totalEvaluated += storeEvaluated;
      totalCreated += storeCreated;
      totalSkipped += storeSkipped;
      storeResults.push({ storeId, evaluated: storeEvaluated, created: storeCreated, skipped: storeSkipped });
    }

    log.info(`[ReorderTrigger] Completed: ${storesResult.rows.length} stores, ${totalEvaluated} evaluated, ${totalCreated} created, ${totalSkipped} skipped`);

    return res.json({
      success: true,
      data: {
        storesProcessed: storesResult.rows.length,
        totalEvaluated,
        totalCreated,
        totalSkipped,
        stores: storeResults,
      },
    });
  } catch (err) {
    log.error('[ReorderTrigger] Error:', err);
    return res.status(500).json({ error: 'Reorder trigger check failed' });
  }
});

// GET /admin/monitoring/health — Comprehensive health check for T-223 monitoring
adminScheduledJobsRouter.get('/monitoring/health', async (_req: Request, res: Response) => {
  const pool = getPool();
  const checks: Record<string, { status: string; latencyMs?: number; details?: string }> = {};

  // Database check
  const dbStart = Date.now();
  try {
    if (pool) {
      await pool.query('SELECT 1');
      checks.database = { status: 'healthy', latencyMs: Date.now() - dbStart };
    } else {
      checks.database = { status: 'unhealthy', details: 'Pool not initialized' };
    }
  } catch (err) {
    checks.database = { status: 'unhealthy', latencyMs: Date.now() - dbStart, details: String(err) };
  }

  // Redis check
  try {
    const ioredis = await import('ioredis');
    const RedisClass = ioredis.default as any;
    const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`;
    const redis = new RedisClass(redisUrl, { connectTimeout: 3000, lazyConnect: true });
    const redisStart = Date.now();
    await redis.ping();
    checks.redis = { status: 'healthy', latencyMs: Date.now() - redisStart };
    await redis.quit();
  } catch (err) {
    checks.redis = { status: 'unhealthy', details: String(err) };
  }

  // Memory check
  const mem = process.memoryUsage();
  const memUsageMB = Math.round(mem.heapUsed / 1024 / 1024);
  checks.memory = {
    status: memUsageMB < 400 ? 'healthy' : 'warning',
    details: `${memUsageMB}MB heap used`,
  };

  const allHealthy = Object.values(checks).every((c) => c.status !== 'unhealthy');

  return res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
    uptime: process.uptime(),
    version: process.env.GIT_SHA || 'unknown',
  });
});
