/**
 * Phase 8: POS Push Notification Routes
 * T-232: FCM device token registration + notification history
 *
 * Endpoints:
 * - POST   /notifications/device-token     Register/update FCM token
 * - DELETE /notifications/device-token      Remove FCM token (logout)
 * - GET    /notifications                   Get notification history
 * - GET    /notifications/unread-count      Get unread count
 * - PUT    /notifications/:id/read          Mark notification as read
 * - PUT    /notifications/read-all          Mark all as read
 */

import { Router, Request, Response } from 'express';
import { requireDeviceToken } from '../../../middleware/posDeviceToken';
import { getPool } from '../../../db/client';
import {
import { log } from "../../../lib/logger";
  registerDeviceToken,
  removeDeviceToken,
} from '../../../services/fcmService';

export const posNotificationsRouter = Router();

posNotificationsRouter.use(requireDeviceToken);

// POST /notifications/device-token — Register FCM push token
posNotificationsRouter.post('/notifications/device-token', async (req: Request, res: Response) => {
  const userId = (req as any).deviceUserId || (req as any).storeUserId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { token, platform } = req.body as { token?: string; platform?: string };

  if (!token || typeof token !== 'string' || token.length < 10) {
    return res.status(400).json({ error: 'Valid FCM token is required' });
  }

  const validPlatforms = ['android', 'ios', 'web'];
  const devicePlatform = (platform || 'android').toLowerCase();
  if (!validPlatforms.includes(devicePlatform)) {
    return res.status(400).json({ error: 'Platform must be android, ios, or web' });
  }

  try {
    const result = await registerDeviceToken(
      userId,
      token,
      devicePlatform as 'android' | 'ios' | 'web'
    );

    return res.json({
      success: true,
      data: {
        tokenId: result.id,
        isNew: result.isNew,
      },
    });
  } catch (err) {
    log.error('[POS Notifications] Token registration error:', err);
    return res.status(500).json({ error: 'Failed to register device token' });
  }
});

// DELETE /notifications/device-token — Remove FCM token on logout
posNotificationsRouter.delete('/notifications/device-token', async (req: Request, res: Response) => {
  const userId = (req as any).deviceUserId || (req as any).storeUserId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { token } = req.body as { token?: string };
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const removed = await removeDeviceToken(userId, token);
    return res.json({ success: true, removed });
  } catch (err) {
    log.error('[POS Notifications] Token removal error:', err);
    return res.status(500).json({ error: 'Failed to remove device token' });
  }
});

// GET /notifications — Get notification history (paginated)
posNotificationsRouter.get('/notifications', async (req: Request, res: Response) => {
  const userId = (req as any).deviceUserId || (req as any).storeUserId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const type = req.query.type as string | undefined;

  try {
    let query = `
      SELECT id, title, body, data, notification_type, priority,
             is_read, read_at, delivered_at, created_at
      FROM notifications.notifications
      WHERE recipient_id = $1
    `;
    const params: (string | number)[] = [userId];
    let paramIdx = 2;

    if (type) {
      query += ` AND notification_type = $${paramIdx++}`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const countQuery = `SELECT COUNT(*)::int AS total FROM notifications.notifications WHERE recipient_id = $1`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, [userId]),
    ]);

    return res.json({
      success: true,
      data: dataResult.rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        data: r.data,
        type: r.notification_type,
        priority: r.priority,
        isRead: r.is_read,
        readAt: r.read_at,
        deliveredAt: r.delivered_at,
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
    // Table may not exist yet
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
      return res.json({ success: true, data: [], pagination: { total: 0, limit, offset, hasMore: false } });
    }
    log.error('[POS Notifications] List error:', err);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /notifications/unread-count — Get unread notification count
posNotificationsRouter.get('/notifications/unread-count', async (req: Request, res: Response) => {
  const userId = (req as any).deviceUserId || (req as any).storeUserId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM notifications.notifications WHERE recipient_id = $1 AND is_read = false`,
      [userId]
    );
    return res.json({ success: true, count: result.rows[0]?.count || 0 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
      return res.json({ success: true, count: 0 });
    }
    log.error('[POS Notifications] Unread count error:', err);
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// PUT /notifications/:id/read — Mark a single notification as read
posNotificationsRouter.put('/notifications/:id/read', async (req: Request, res: Response) => {
  const userId = (req as any).deviceUserId || (req as any).storeUserId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE notifications.notifications
       SET is_read = true, read_at = NOW()
       WHERE id = $1::uuid AND recipient_id = $2 AND is_read = false
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found or already read' });
    }

    return res.json({ success: true });
  } catch (err) {
    log.error('[POS Notifications] Mark read error:', err);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// PUT /notifications/read-all — Mark all notifications as read
posNotificationsRouter.put('/notifications/read-all', async (req: Request, res: Response) => {
  const userId = (req as any).deviceUserId || (req as any).storeUserId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const result = await pool.query(
      `UPDATE notifications.notifications
       SET is_read = true, read_at = NOW()
       WHERE recipient_id = $1 AND is_read = false`,
      [userId]
    );

    return res.json({ success: true, markedRead: result.rowCount ?? 0 });
  } catch (err) {
    log.error('[POS Notifications] Mark all read error:', err);
    return res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});
