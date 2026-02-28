// GO-LIVE-144: Auth Audit Service
// Centralized service for logging authentication events

import { getPool } from "../db/client";
import { log } from "../lib/logger";

// =============================================================================
// TYPES
// =============================================================================

export type AuthEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'logout_all'
  | 'password_change'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'otp_request'
  | 'otp_verify_success'
  | 'otp_verify_failed'
  | 'token_refresh'
  | 'account_locked'
  | 'account_unlocked';

export interface AuthAuditEvent {
  eventType: AuthEventType;
  actorType: 'supplier' | 'retailer' | 'admin' | 'platform';
  actorId?: string;
  email?: string;
  phone?: string;
  storeId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Log an authentication event to the audit table
 * Non-blocking - failures are logged but don't affect the request
 */
export async function logAuthEvent(event: AuthAuditEvent): Promise<void> {
  const pool = getPool();
  if (!pool) {
    log.warn('[GO-LIVE-144] Auth audit: Pool unavailable');
    return;
  }

  try {
    await pool.query(
      `INSERT INTO auth.audit_log
       (event_type, actor_type, actor_id, email, phone, store_id,
        ip_address, user_agent, success, error_code, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        event.eventType,
        event.actorType,
        event.actorId || null,
        event.email || null,
        event.phone || null,
        event.storeId || null,
        event.ipAddress || null,
        event.userAgent || null,
        event.success,
        event.errorCode || null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    );

    // Log critical events to console as well
    if (['login_success', 'account_locked', 'logout_all'].includes(event.eventType)) {
      // FIREBASE-HARDENING-B: Mask PII in console logs (full details remain in audit_log table)
      const maskedIdentity = event.email
        ? event.email.split('@')[0].slice(0, 2) + '***@' + (event.email.split('@')[1] || '***')
        : event.phone
          ? '***' + event.phone.slice(-4)
          : event.actorId;
      log.info(`[GO-LIVE-144] Auth event: ${event.eventType} for ${maskedIdentity} (${event.actorType})`);
    }
  } catch (err) {
    // Non-critical - don't fail the request
    log.warn('[GO-LIVE-144] Failed to log auth event:', err);
  }
}

/**
 * Log a successful login
 */
export async function logLoginSuccess(params: {
  actorType: 'supplier' | 'retailer' | 'admin' | 'platform';
  actorId: string;
  email?: string;
  phone?: string;
  storeId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await logAuthEvent({
    eventType: 'login_success',
    actorType: params.actorType,
    actorId: params.actorId,
    email: params.email,
    phone: params.phone,
    storeId: params.storeId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    success: true,
  });
}

/**
 * Log a failed login attempt
 */
export async function logLoginFailed(params: {
  actorType: 'supplier' | 'retailer' | 'admin' | 'platform';
  email?: string;
  phone?: string;
  ipAddress?: string;
  userAgent?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAuthEvent({
    eventType: 'login_failed',
    actorType: params.actorType,
    email: params.email,
    phone: params.phone,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    success: false,
    errorCode: params.errorCode,
    metadata: params.metadata,
  });
}

/**
 * Log account lockout
 */
export async function logAccountLocked(params: {
  actorType: 'supplier' | 'retailer' | 'admin';
  actorId?: string;
  email?: string;
  ipAddress?: string;
  lockDurationMinutes: number;
  failedAttempts: number;
}): Promise<void> {
  await logAuthEvent({
    eventType: 'account_locked',
    actorType: params.actorType,
    actorId: params.actorId,
    email: params.email,
    ipAddress: params.ipAddress,
    success: false,
    metadata: {
      lockDurationMinutes: params.lockDurationMinutes,
      failedAttempts: params.failedAttempts,
    },
  });
}
