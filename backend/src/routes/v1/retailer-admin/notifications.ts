/**
 * Phase 8: Retailer Admin Notification Routes
 * T-232: In-app notification center for Retailer Admin portal
 *
 * Endpoints:
 * - POST   /notifications/device-token     Register web push token
 * - GET    /notifications                   Get notification history
 * - GET    /notifications/unread-count      Get unread count
 * - PUT    /notifications/:id/read          Mark as read
 * - PUT    /notifications/read-all          Mark all as read
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../../../db/client';
import { registerDeviceToken, removeDeviceToken } from '../../../services/fcmService';
import { log } from "../../../lib/logger";

export const retailerNotificationsRouter = Router();

// STG-067: Helper to extract auth context from gateway headers (not req.userId/req.storeId)
function getNotifUserId(req: Request): string | undefined {
  return (req.headers['x-user-id'] as string) || undefined;
}
function getNotifStoreId(req: Request): string | undefined {
  return (req.headers['x-actor-id'] as string) || undefined;
}

// POST /notifications/device-token — Register web push token
retailerNotificationsRouter.post('/notifications/device-token', async (req: Request, res: Response) => {
  const userId = getNotifUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const { token } = req.body as { token?: string };
  if (!token || token.length < 10) {
    return res.status(400).json({ error: 'Valid push token is required' });
  }

  try {
    const result = await registerDeviceToken(userId, token, 'web');
    return res.json({ success: true, data: { tokenId: result.id, isNew: result.isNew } });
  } catch (err) {
    log.error('[Retailer Notifications] Token registration error:', err);
    return res.status(500).json({ error: 'Failed to register token' });
  }
});

// DELETE /notifications/device-token — Remove push token
retailerNotificationsRouter.delete('/notifications/device-token', async (req: Request, res: Response) => {
  const userId = getNotifUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    await removeDeviceToken(userId, token);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove token' });
  }
});

// GET /notifications — Notification history (paginated)
retailerNotificationsRouter.get('/notifications', async (req: Request, res: Response) => {
  const storeId = getNotifStoreId(req);
  const userId = getNotifUserId(req);
  if (!storeId && !userId) return res.status(401).json({ error: 'Authentication required' });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    // Get notifications for both user and store
    const result = await pool.query(`
      SELECT id, title, body, data, notification_type, priority,
             is_read, read_at, created_at
      FROM notifications.notifications
      WHERE recipient_id IN ($1, $2)
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `, [userId || storeId, storeId || userId, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM notifications.notifications
      WHERE recipient_id IN ($1, $2)
    `, [userId || storeId, storeId || userId]);

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        data: r.data,
        type: r.notification_type,
        isRead: r.is_read,
        readAt: r.read_at,
        createdAt: r.created_at,
      })),
      pagination: {
        total: countResult.rows[0]?.total || 0,
        limit,
        offset,
        hasMore: offset + limit < (countResult.rows[0]?.total || 0),
      },
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
      return res.json({ success: true, data: [], pagination: { total: 0, limit, offset, hasMore: false } });
    }
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /notifications/unread-count
retailerNotificationsRouter.get('/notifications/unread-count', async (req: Request, res: Response) => {
  const storeId = getNotifStoreId(req);
  const userId = getNotifUserId(req);

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM notifications.notifications
      WHERE recipient_id IN ($1, $2) AND is_read = false
    `, [userId || storeId, storeId || userId]);

    return res.json({ success: true, count: result.rows[0]?.count || 0 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
      return res.json({ success: true, count: 0 });
    }
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// PUT /notifications/:id/read — Mark as read
retailerNotificationsRouter.put('/notifications/:id/read', async (req: Request, res: Response) => {
  const storeId = getNotifStoreId(req);
  const userId = getNotifUserId(req);

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    await pool.query(`
      UPDATE notifications.notifications
      SET is_read = true, read_at = NOW()
      WHERE id = $1::uuid AND recipient_id IN ($2, $3) AND is_read = false
    `, [req.params.id, userId || storeId, storeId || userId]);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// PUT /notifications/read-all
retailerNotificationsRouter.put('/notifications/read-all', async (req: Request, res: Response) => {
  const storeId = getNotifStoreId(req);
  const userId = getNotifUserId(req);

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const result = await pool.query(`
      UPDATE notifications.notifications
      SET is_read = true, read_at = NOW()
      WHERE recipient_id IN ($1, $2) AND is_read = false
    `, [userId || storeId, storeId || userId]);

    return res.json({ success: true, markedRead: result.rowCount ?? 0 });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});
