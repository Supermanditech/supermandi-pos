/**
 * GCP-STG-0745: Notification center helper
 * createNotification() — creates a notification in both user-scoped and store-scoped tables
 */

import { getPool } from "../db/client";
import { log } from "../lib/logger";

export interface CreateNotificationInput {
  recipientId: string;
  storeId?: string;
  title: string;
  body?: string;
  notificationType?: string;
  category?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  data?: Record<string, unknown>;
}

/**
 * Creates a notification in the notifications.notifications table (user-scoped)
 * and optionally in platform.notifications (store-scoped).
 * Returns the notification ID, or null if creation fails.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  const pool = getPool();
  if (!pool) {
    log.warn("[GCP-STG-0745] Cannot create notification — database unavailable");
    return null;
  }

  const {
    recipientId,
    storeId,
    title,
    body = null,
    notificationType = 'general',
    category = 'general',
    priority = 'normal',
    data = null,
  } = input;

  try {
    // Insert into user-scoped notifications table
    const result = await pool.query(
      `INSERT INTO notifications.notifications
        (recipient_id, title, body, notification_type, priority, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [recipientId, title, body, notificationType, priority, data ? JSON.stringify(data) : null]
    );

    const notificationId = result.rows[0]?.id;

    // Also insert into store-scoped platform.notifications if storeId provided
    if (storeId) {
      try {
        await pool.query(
          `INSERT INTO platform.notifications
            (store_id, title, body, category, priority, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [storeId, title, body, category, priority, data ? JSON.stringify(data) : null]
        );
      } catch {
        // platform.notifications table may not exist yet — graceful fallback
        log.warn("[GCP-STG-0745] platform.notifications insert failed (table may not exist)");
      }
    }

    return notificationId || null;
  } catch (err: any) {
    // Table may not exist
    if (err?.code === '42P01') {
      log.warn("[GCP-STG-0745] notifications table does not exist yet");
      return null;
    }
    log.error("[GCP-STG-0745] createNotification failed:", err?.message);
    return null;
  }
}
