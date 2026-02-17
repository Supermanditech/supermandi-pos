/**
 * Phase 8: Firebase Cloud Messaging (FCM) Service
 * T-232: GRN alert delivery mechanism
 *
 * Sends push notifications via Firebase Admin SDK.
 * Handles token management, multicast, and delivery tracking.
 */

import * as admin from 'firebase-admin';
import { getPool } from '../db/client';
import { log } from "../lib/logger";

// =============================================================================
// TYPES
// =============================================================================

export interface PushNotificationInput {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  priority?: 'high' | 'normal';
  channel?: string;  // Android notification channel
}

export interface SendResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  errors: Array<{ token: string; error: string; code?: string }>;
}

// =============================================================================
// FCM MESSAGING
// =============================================================================

/**
 * Get Firebase Messaging instance (requires Firebase Admin to be initialized)
 */
function getMessaging(): admin.messaging.Messaging {
  return admin.messaging();
}

/**
 * Send push notification to a single user by userId.
 * Looks up active device tokens and sends to all of them.
 */
export async function sendToUser(
  userId: string,
  notification: PushNotificationInput
): Promise<SendResult> {
  const tokens = await getActiveTokensForUser(userId);
  if (tokens.length === 0) {
    return { success: true, successCount: 0, failureCount: 0, errors: [] };
  }
  return sendToTokens(tokens, notification);
}

/**
 * Send push notification to all users of a store.
 */
export async function sendToStore(
  storeId: string,
  notification: PushNotificationInput
): Promise<SendResult> {
  const tokens = await getActiveTokensForStore(storeId);
  if (tokens.length === 0) {
    return { success: true, successCount: 0, failureCount: 0, errors: [] };
  }
  return sendToTokens(tokens, notification);
}

/**
 * Send push notification to a supplier's users.
 */
export async function sendToSupplier(
  supplierId: string,
  notification: PushNotificationInput
): Promise<SendResult> {
  const tokens = await getActiveTokensForSupplier(supplierId);
  if (tokens.length === 0) {
    return { success: true, successCount: 0, failureCount: 0, errors: [] };
  }
  return sendToTokens(tokens, notification);
}

/**
 * Send multicast to specific FCM tokens.
 * Handles batching (FCM limit: 500 per multicast).
 */
export async function sendToTokens(
  tokens: string[],
  notification: PushNotificationInput
): Promise<SendResult> {
  const messaging = getMessaging();
  const result: SendResult = { success: true, successCount: 0, failureCount: 0, errors: [] };

  // FCM multicast limit is 500 tokens
  const BATCH_SIZE = 500;
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);

    const message: admin.messaging.MulticastMessage = {
      tokens: batch,
      notification: {
        title: notification.title,
        body: notification.body,
        ...(notification.imageUrl ? { imageUrl: notification.imageUrl } : {}),
      },
      data: notification.data || {},
      android: {
        priority: notification.priority === 'high' ? 'high' : 'normal',
        notification: {
          channelId: notification.channel || 'default',
          priority: notification.priority === 'high' ? 'max' : 'default',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(message);
      result.successCount += response.successCount;
      result.failureCount += response.failureCount;

      // Track failures and deactivate invalid tokens
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code;
          result.errors.push({
            token: batch[idx],
            error: resp.error.message,
            code: errorCode,
          });

          // Deactivate tokens that are permanently invalid
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            deactivateToken(batch[idx]).catch((err) =>
              log.warn('[FCM] Failed to deactivate token:', err)
            );
          }
        }
      });
    } catch (err) {
      log.error('[FCM] Multicast send error:', err);
      result.success = false;
      result.failureCount += batch.length;
    }
  }

  return result;
}

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

/**
 * Register or update a device token for a user.
 */
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: 'android' | 'ios' | 'web'
): Promise<{ id: string; isNew: boolean }> {
  const pool = getPool();
  if (!pool) throw new Error('Database unavailable');

  // Upsert: if token exists, update user and reactivate; otherwise insert
  const result = await pool.query(
    `INSERT INTO auth.device_tokens (user_id, token, platform, is_active, last_used_at)
     VALUES ($1, $2, $3, true, NOW())
     ON CONFLICT (token) DO UPDATE SET
       user_id = $1,
       platform = $3,
       is_active = true,
       last_used_at = NOW(),
       updated_at = NOW()
     RETURNING id, (xmax = 0) AS is_new`,
    [userId, token, platform]
  );

  return {
    id: result.rows[0].id,
    isNew: result.rows[0].is_new,
  };
}

/**
 * Deactivate a specific token (e.g., on FCM bounce or user logout).
 */
export async function deactivateToken(token: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `UPDATE auth.device_tokens SET is_active = false, updated_at = NOW() WHERE token = $1`,
    [token]
  );
}

/**
 * Remove a device token entirely (user logout / uninstall).
 */
export async function removeDeviceToken(userId: string, token: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  const result = await pool.query(
    `DELETE FROM auth.device_tokens WHERE user_id = $1 AND token = $2`,
    [userId, token]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get active tokens for a user.
 */
async function getActiveTokensForUser(userId: string): Promise<string[]> {
  const pool = getPool();
  if (!pool) return [];

  const result = await pool.query(
    `SELECT token FROM auth.device_tokens WHERE user_id = $1 AND is_active = true`,
    [userId]
  );
  return result.rows.map((r) => r.token);
}

/**
 * Get active tokens for all users of a store.
 */
async function getActiveTokensForStore(storeId: string): Promise<string[]> {
  const pool = getPool();
  if (!pool) return [];

  const result = await pool.query(
    `SELECT dt.token
     FROM auth.device_tokens dt
     JOIN auth.users u ON u.id = dt.user_id
     WHERE u.store_id = $1 AND dt.is_active = true`,
    [storeId]
  );
  return result.rows.map((r) => r.token);
}

/**
 * Get active tokens for a supplier's users.
 */
async function getActiveTokensForSupplier(supplierId: string): Promise<string[]> {
  const pool = getPool();
  if (!pool) return [];

  const result = await pool.query(
    `SELECT dt.token
     FROM auth.device_tokens dt
     JOIN auth.users u ON u.id = dt.user_id
     WHERE u.supplier_id = $1 AND dt.is_active = true`,
    [supplierId]
  );
  return result.rows.map((r) => r.token);
}

// =============================================================================
// NOTIFICATION PERSISTENCE
// =============================================================================

/**
 * Store a notification in the database for in-app display.
 */
export async function createNotification(input: {
  recipientId: string;
  recipientType?: 'user' | 'store' | 'supplier';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  notificationType: string;
  priority?: 'high' | 'normal';
}): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error('Database unavailable');

  const result = await pool.query(
    `INSERT INTO notifications.notifications
       (recipient_id, recipient_type, title, body, data, notification_type, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.recipientId,
      input.recipientType || 'user',
      input.title,
      input.body,
      JSON.stringify(input.data || {}),
      input.notificationType,
      input.priority || 'normal',
    ]
  );
  return result.rows[0].id;
}

/**
 * Send push + persist notification in one call.
 * This is the primary function for sending notifications.
 */
export async function sendAndPersistNotification(input: {
  recipientId: string;
  recipientType?: 'user' | 'store' | 'supplier';
  title: string;
  body: string;
  data?: Record<string, string>;
  notificationType: string;
  priority?: 'high' | 'normal';
  imageUrl?: string;
}): Promise<{ notificationId: string; pushResult: SendResult }> {
  // 1. Persist notification for in-app display
  const notificationId = await createNotification({
    recipientId: input.recipientId,
    recipientType: input.recipientType,
    title: input.title,
    body: input.body,
    data: input.data,
    notificationType: input.notificationType,
    priority: input.priority,
  });

  // 2. Send push notification
  const pushNotification: PushNotificationInput = {
    title: input.title,
    body: input.body,
    data: {
      ...(input.data || {}),
      notificationId,
      type: input.notificationType,
    },
    imageUrl: input.imageUrl,
    priority: input.priority,
  };

  let pushResult: SendResult;
  try {
    if (input.recipientType === 'store') {
      pushResult = await sendToStore(input.recipientId, pushNotification);
    } else if (input.recipientType === 'supplier') {
      pushResult = await sendToSupplier(input.recipientId, pushNotification);
    } else {
      pushResult = await sendToUser(input.recipientId, pushNotification);
    }

    // Update delivered_at if any succeeded
    if (pushResult.successCount > 0) {
      const pool = getPool();
      if (pool) {
        await pool.query(
          `UPDATE notifications.notifications SET delivered_at = NOW() WHERE id = $1`,
          [notificationId]
        );
      }
    }
  } catch (err) {
    log.error('[FCM] sendAndPersist push failed:', err);
    pushResult = { success: false, successCount: 0, failureCount: 0, errors: [] };
  }

  return { notificationId, pushResult };
}
