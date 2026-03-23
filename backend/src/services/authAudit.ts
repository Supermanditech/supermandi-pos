// GCP-STG-0489: Auth event audit trail for security compliance
// Non-blocking — audit logging should never break auth flows

import { getPool } from '../db/client';

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
  | 'totp_disabled';

export interface AuthEventParams {
  actorType: AuthActorType;
  actorId?: string;
  eventType: AuthEventType;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
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
    console.error('[AUTH-AUDIT] Failed to log event:', (err as Error).message);
  }
}
