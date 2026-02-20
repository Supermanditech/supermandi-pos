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
