// GCP-STG-0489: Auth event audit trail for security compliance
// Non-blocking — audit logging should never break auth flows

import { getPool } from '../db/client';
import { log } from '../lib/logger';

export type AuthActorType = 'admin' | 'retailer' | 'supplier' | 'pos_device';
export type AuthEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'password_changed'
  | 'otp_sent'
  | 'otp_verified'
  | 'device_enrolled'
  | 'device_revoked'
  | 'totp_enabled'
  | 'totp_disabled'
  | 'totp_devices_revoked';

export interface AuthEventParams {
  actorType: AuthActorType;
  actorId?: string;
  eventType: AuthEventType;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// GCP-STG-0682: Auto-archive auth_events older than 90 days
// Called by Cloud Scheduler weekly (Sunday 3 AM IST) via POST /admin/maintenance/archive-auth-events
const RETENTION_DAYS = parseInt(process.env.AUTH_EVENT_RETENTION_DAYS || '90', 10);

export async function archiveOldAuthEvents(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  try {
    const result = await pool.query(
      `DELETE FROM auth.auth_events
       WHERE created_at < NOW() - MAKE_INTERVAL(days => $1)
       RETURNING id`,
      [RETENTION_DAYS]
    );
    const count = result.rowCount || 0;
    if (count > 0) {
      log.info(`[AUTH-AUDIT] Archived ${count} auth events older than ${RETENTION_DAYS} days`);
    }
    return count;
  } catch (err) {
    log.error('[AUTH-AUDIT] Failed to archive old events:', (err as Error).message);
    return 0;
  }
}

export async function logAuthEvent(params: AuthEventParams): Promise<void> {
  try {
    const pool = getPool();
    if (!pool) return;
    await pool.query(
      `INSERT INTO auth.auth_events (actor_type, actor_id, event_type, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.actorType,
        params.actorId ?? null,
        params.eventType,
        params.ipAddress ?? null,
        params.userAgent ?? null,
        JSON.stringify(params.metadata ?? {}),
      ]
    );
  } catch (err) {
    // Non-blocking — audit logging should never break auth flow
    log.error('[AUTH-AUDIT] Failed to log event:', (err as Error).message);
  }
}
