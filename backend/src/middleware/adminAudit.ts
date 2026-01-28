// Admin Audit Middleware - DEV-067
// Logs all admin actions to admin.audit_log table

import { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/client';

// Sensitive fields to redact from request body
const SENSITIVE_FIELDS = ['password', 'pin', 'token', 'secret', 'apiKey'];

/**
 * Sanitize request body by removing sensitive fields
 */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(sanitizeBody);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeBody(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Extract action and resource info from request
 */
function extractActionInfo(req: Request): {
  action: string;
  resourceType: string;
  resourceId: string | null;
  storeId: string | null;
} {
  const method = req.method.toUpperCase();
  const path = req.path;

  // Parse path segments
  const segments = path.split('/').filter(Boolean);

  // Common patterns:
  // /admin/stores - store management
  // /admin/stores/:storeId - specific store
  // /admin/stores/:storeId/users - store users
  // /admin/stores/:storeId/devices - store devices
  // /admin/stores/:storeId/device-enrollments - enrollments
  // /admin/devices/:deviceId/block - device actions

  let action = 'unknown';
  let resourceType = 'unknown';
  let resourceId: string | null = null;
  let storeId: string | null = null;

  // Pattern: /admin/stores
  if (segments[0] === 'stores') {
    storeId = segments[1] || null;

    if (segments.length === 1) {
      // /admin/stores
      resourceType = 'store';
      action = method === 'POST' ? 'store.create' : 'store.list';
    } else if (segments.length === 2) {
      // /admin/stores/:storeId
      resourceType = 'store';
      resourceId = segments[1];
      action =
        method === 'GET'
          ? 'store.get'
          : method === 'PUT'
            ? 'store.update'
            : method === 'DELETE'
              ? 'store.delete'
              : 'store.unknown';
    } else if (segments[2] === 'users') {
      // /admin/stores/:storeId/users[/:userId]
      resourceType = 'user';
      resourceId = segments[3] || null;
      action =
        segments.length === 3
          ? method === 'POST'
            ? 'user.create'
            : 'user.list'
          : method === 'GET'
            ? 'user.get'
            : method === 'PATCH'
              ? 'user.update'
              : method === 'DELETE'
                ? 'user.delete'
                : 'user.unknown';
    } else if (segments[2] === 'devices') {
      // /admin/stores/:storeId/devices
      resourceType = 'device';
      action = 'device.list';
    } else if (segments[2] === 'device-enrollments') {
      // /admin/stores/:storeId/device-enrollments
      resourceType = 'enrollment';
      resourceId = segments[3] || null;
      action = method === 'POST' ? 'enrollment.create' : 'enrollment.list';
    }
  } else if (segments[0] === 'devices') {
    // /admin/devices/:deviceId/block|unblock
    resourceType = 'device';
    resourceId = segments[1] || null;
    if (segments[2] === 'block') {
      action = 'device.block';
    } else if (segments[2] === 'unblock') {
      action = 'device.unblock';
    }
  } else if (segments[0] === 'device-enrollments') {
    // /admin/device-enrollments/:id/revoke
    resourceType = 'enrollment';
    resourceId = segments[1] || null;
    if (segments[2] === 'revoke') {
      action = 'enrollment.revoke';
    }
  }

  return { action, resourceType, resourceId, storeId };
}

/**
 * Write audit log entry
 */
async function writeAuditLog(params: {
  actorUserId?: string;
  actorIp?: string;
  actorUserAgent?: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  storeId?: string | null;
  requestBody?: unknown;
  responseStatus: number;
  errorMessage?: string;
}): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO admin.audit_log (
        actor_user_id, actor_ip, actor_user_agent,
        action, resource_type, resource_id, store_id,
        request_body, response_status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        params.actorUserId || null,
        params.actorIp || null,
        params.actorUserAgent || null,
        params.action,
        params.resourceType,
        params.resourceId || null,
        params.storeId || null,
        params.requestBody ? JSON.stringify(params.requestBody) : null,
        params.responseStatus,
        params.errorMessage || null,
      ]
    );
  } catch (error) {
    // Don't fail the request if audit logging fails
    console.error('[AdminAudit] Failed to write audit log:', error);
  }
}

/**
 * Middleware to automatically audit admin requests
 */
export function adminAuditMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const { action, resourceType, resourceId, storeId } = extractActionInfo(req);

    // Get actor info from request
    const actorUserId = req.headers['x-user-id'] as string | undefined;
    const actorIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress;
    const actorUserAgent = req.headers['user-agent'];

    // Sanitize request body
    const sanitizedBody = sanitizeBody(req.body);

    // Capture response finish
    res.on('finish', () => {
      writeAuditLog({
        actorUserId,
        actorIp,
        actorUserAgent,
        action,
        resourceType,
        resourceId,
        storeId: storeId || (req.params?.storeId as string),
        requestBody: sanitizedBody,
        responseStatus: res.statusCode,
        errorMessage: res.statusCode >= 400 ? res.statusMessage : undefined,
      });
    });

    next();
  };
}

export { writeAuditLog };
