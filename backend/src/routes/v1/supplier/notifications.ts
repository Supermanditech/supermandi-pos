/**
 * Phase 8: Supplier Portal Notification Routes
 * Push notification history + token management for suppliers
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../../../db/client';
import { registerDeviceToken, removeDeviceToken } from '../../../services/fcmService';

export const supplierNotificationsRouter = Router();

// POST /supplier/notifications/device-token
supplierNotificationsRouter.post('/notifications/device-token', async (req: Request, res: Response) => {
  const userId = (req as any).supplierId || (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const { token, platform } = req.body as { token?: string; platform?: string };
  if (!token || token.length < 10) return res.status(400).json({ error: 'Valid token required' });

  try {
    const result = await registerDeviceToken(userId, token, (platform || 'web') as 'android' | 'ios' | 'web');
    return res.json({ success: true, data: { tokenId: result.id, isNew: result.isNew } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to register token' });
  }
});

// DELETE /supplier/notifications/device-token
supplierNotificationsRouter.delete('/notifications/device-token', async (req: Request, res: Response) => {
  const userId = (req as any).supplierId || (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    await removeDeviceToken(userId, token);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

// GET /supplier/notifications
supplierNotificationsRouter.get('/notifications', async (req: Request, res: Response) => {
  const supplierId = (req as any).supplierId;
  const userId = (req as any).userId;
  if (!supplierId && !userId) return res.status(401).json({ error: 'Authentication required' });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const result = await pool.query(`
      SELECT id, title, body, data, notification_type, is_read, read_at, created_at
      FROM notifications.notifications
      WHERE recipient_id IN ($1, $2)
      ORDER BY created_at DESC LIMIT $3 OFFSET $4
    `, [supplierId || userId, userId || supplierId, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*)::int AS total FROM notifications.notifications WHERE recipient_id IN ($1, $2)
    `, [supplierId || userId, userId || supplierId]);

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id, title: r.title, body: r.body, data: r.data,
        type: r.notification_type, isRead: r.is_read, readAt: r.read_at, createdAt: r.created_at,
      })),
      pagination: { total: countResult.rows[0]?.total || 0, limit, offset, hasMore: offset + limit < (countResult.rows[0]?.total || 0) },
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
      return res.json({ success: true, data: [], pagination: { total: 0, limit, offset, hasMore: false } });
    }
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /supplier/notifications/unread-count
supplierNotificationsRouter.get('/notifications/unread-count', async (req: Request, res: Response) => {
  const supplierId = (req as any).supplierId;
  const userId = (req as any).userId;
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS count FROM notifications.notifications WHERE recipient_id IN ($1, $2) AND is_read = false
    `, [supplierId || userId, userId || supplierId]);
    return res.json({ success: true, count: result.rows[0]?.count || 0 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
      return res.json({ success: true, count: 0 });
    }
    return res.status(500).json({ error: 'Failed' });
  }
});

// PUT /supplier/notifications/:id/read
supplierNotificationsRouter.put('/notifications/:id/read', async (req: Request, res: Response) => {
  const supplierId = (req as any).supplierId;
  const userId = (req as any).userId;
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    await pool.query(`
      UPDATE notifications.notifications SET is_read = true, read_at = NOW()
      WHERE id = $1::uuid AND recipient_id IN ($2, $3) AND is_read = false
    `, [req.params.id, supplierId || userId, userId || supplierId]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

// PUT /supplier/notifications/read-all
supplierNotificationsRouter.put('/notifications/read-all', async (req: Request, res: Response) => {
  const supplierId = (req as any).supplierId;
  const userId = (req as any).userId;
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const result = await pool.query(`
      UPDATE notifications.notifications SET is_read = true, read_at = NOW()
      WHERE recipient_id IN ($1, $2) AND is_read = false
    `, [supplierId || userId, userId || supplierId]);
    return res.json({ success: true, markedRead: result.rowCount ?? 0 });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});
