// Device and Enrollment Queries - PROV-002
// CRUD operations for pos_devices and pos_device_enrollments

import { query, BaseEntity } from '@supermandi/common';
import crypto from 'crypto';

// =============================================================================
// DEVICE TYPES
// =============================================================================

export interface Device extends BaseEntity {
  storeId: string;
  deviceId: string;
  deviceToken?: string;
  label?: string;
  deviceType: string;
  printingMode?: string;
  manufacturer?: string;
  model?: string;
  androidVersion?: string;
  appVersion?: string;
  status: 'active' | 'blocked';
  active: boolean;
  enrolledAt: string;
  lastSeenAt?: string;
}

export interface DeviceEnrollment extends BaseEntity {
  storeId: string;
  code: string;
  enrollmentCodeHash?: string;
  label?: string;
  expiresAt: string;
  usedAt?: string;
  usedDeviceId?: string;
  revokedAt?: string;
  // DEV-071: Multi-use support
  maxUses: number;
  usesCount: number;
}

// =============================================================================
// DEVICE QUERIES
// =============================================================================

export async function getDevicesForStore(storeId: string): Promise<Device[]> {
  // GCP-PARITY-409: Map actual DB columns to interface fields
  // device_id → id (no separate device_id column)
  // status → computed from active boolean
  // enrolled_at → created_at (enrollment time = row creation time)
  // last_seen_at → last_seen_online (actual column name)
  return query<Device>(
    `SELECT
      id, store_id as "storeId", id::TEXT as "deviceId",
      device_token as "deviceToken", label,
      device_type as "deviceType", printing_mode as "printingMode",
      manufacturer, model, android_version as "androidVersion",
      app_version as "appVersion",
      CASE WHEN active THEN 'active' ELSE 'blocked' END as status,
      active,
      created_at as "enrolledAt",
      last_seen_online as "lastSeenAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM public.pos_devices
    WHERE store_id = $1
    ORDER BY created_at DESC`,
    [storeId]
  );
}

export async function getDeviceById(deviceId: string): Promise<Device | null> {
  // GCP-PARITY-409: Map actual DB columns (see getDevicesForStore comment)
  const rows = await query<Device>(
    `SELECT
      id, store_id as "storeId", id::TEXT as "deviceId",
      device_token as "deviceToken", label,
      device_type as "deviceType", printing_mode as "printingMode",
      manufacturer, model, android_version as "androidVersion",
      app_version as "appVersion",
      CASE WHEN active THEN 'active' ELSE 'blocked' END as status,
      active,
      created_at as "enrolledAt",
      last_seen_online as "lastSeenAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM public.pos_devices
    WHERE id = $1`,
    [deviceId]
  );
  return rows[0] || null;
}

export async function updateDeviceStatus(
  deviceId: string,
  status: 'active' | 'blocked'
): Promise<Device | null> {
  // GCP-PARITY-409: Only SET active (no status column in DB), map in RETURNING
  const rows = await query<Device>(
    `UPDATE public.pos_devices
    SET active = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING
      id, store_id as "storeId", id::TEXT as "deviceId",
      device_token as "deviceToken", label,
      device_type as "deviceType", printing_mode as "printingMode",
      manufacturer, model, android_version as "androidVersion",
      app_version as "appVersion",
      CASE WHEN active THEN 'active' ELSE 'blocked' END as status,
      active,
      created_at as "enrolledAt",
      last_seen_online as "lastSeenAt",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [status === 'active', deviceId]
  );
  return rows[0] || null;
}

// =============================================================================
// ENROLLMENT QUERIES
// =============================================================================

/**
 * Generate a secure enrollment code (6-8 alphanumeric uppercase)
 */
export function generateEnrollmentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: 0,O,1,I
  let code = 'SM-'; // Prefix for SuperMandi
  const randomBytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(randomBytes[i] % chars.length);
  }
  return code;
}

/**
 * Hash an enrollment code for secure storage
 */
export function hashEnrollmentCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

// DEV-071: Check if demo mode is enabled
function isDemoMultiUseAllowed(): boolean {
  return process.env.ALLOW_DEMO_MULTIUSE === 'true';
}

export async function createEnrollment(input: {
  storeId: string;
  expiresInMinutes?: number;
  label?: string;
  maxUses?: number;
  isDemo?: boolean;
}): Promise<DeviceEnrollment & { code: string }> {
  // DEV-071: Demo codes get SM-DEMO prefix and can have higher max_uses
  const isDemo = input.isDemo === true;
  const code = isDemo ? `SM-DEMO${generateEnrollmentCode().slice(3)}` : generateEnrollmentCode();
  const codeHash = hashEnrollmentCode(code);
  const expiresInMinutes = Math.min(input.expiresInMinutes || 10, 60); // Max 60 minutes

  // DEV-071: Multi-use logic
  // - Demo codes can have max_uses up to 100 when ALLOW_DEMO_MULTIUSE=true
  // - Regular codes are always single-use (max_uses=1)
  let maxUses = 1;
  if (isDemo && isDemoMultiUseAllowed()) {
    maxUses = Math.min(input.maxUses || 10, 100); // Default 10, max 100 for demo
  }

  const rows = await query<DeviceEnrollment>(
    `INSERT INTO public.pos_device_enrollments (
      store_id, code, enrollment_code_hash, label, expires_at, max_uses, uses_count
    ) VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $6), $5, 0)
    RETURNING
      id, store_id as "storeId", code, label,
      enrollment_code_hash as "enrollmentCodeHash",
      expires_at as "expiresAt",
      used_at as "usedAt",
      used_device_id as "usedDeviceId",
      COALESCE(max_uses, 1) as "maxUses",
      COALESCE(uses_count, 0) as "usesCount",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [input.storeId, code, codeHash, input.label || null, maxUses, expiresInMinutes]
  );

  return { ...rows[0], code };
}

export async function getEnrollmentsForStore(storeId: string): Promise<DeviceEnrollment[]> {
  return query<DeviceEnrollment>(
    `SELECT
      id, store_id as "storeId", code, label,
      enrollment_code_hash as "enrollmentCodeHash",
      expires_at as "expiresAt",
      used_at as "usedAt",
      used_device_id as "usedDeviceId",
      revoked_at as "revokedAt",
      COALESCE(max_uses, 1) as "maxUses",
      COALESCE(uses_count, 0) as "usesCount",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM public.pos_device_enrollments
    WHERE store_id = $1
    ORDER BY created_at DESC
    LIMIT 50`,
    [storeId]
  );
}

export async function getEnrollmentById(id: string): Promise<DeviceEnrollment | null> {
  const rows = await query<DeviceEnrollment>(
    `SELECT
      id, store_id as "storeId", code, label,
      enrollment_code_hash as "enrollmentCodeHash",
      expires_at as "expiresAt",
      used_at as "usedAt",
      used_device_id as "usedDeviceId",
      revoked_at as "revokedAt",
      COALESCE(max_uses, 1) as "maxUses",
      COALESCE(uses_count, 0) as "usesCount",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM public.pos_device_enrollments
    WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function revokeEnrollment(id: string): Promise<DeviceEnrollment | null> {
  const rows = await query<DeviceEnrollment>(
    `UPDATE public.pos_device_enrollments
    SET revoked_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND revoked_at IS NULL AND used_at IS NULL
    RETURNING
      id, store_id as "storeId", code, label,
      enrollment_code_hash as "enrollmentCodeHash",
      expires_at as "expiresAt",
      used_at as "usedAt",
      used_device_id as "usedDeviceId",
      revoked_at as "revokedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Count recent enrollment codes for a store (for rate limiting)
 */
export async function countRecentEnrollments(storeId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count
    FROM public.pos_device_enrollments
    WHERE store_id = $1
    AND created_at > NOW() - INTERVAL '1 hour'`,
    [storeId]
  );
  return parseInt(rows[0]?.count || '0', 10);
}
