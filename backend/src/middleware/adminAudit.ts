// Admin Audit Middleware - DEV-067
// GO-LIVE-140: Enhanced audit logging for 10+ operations
// Logs all admin actions to admin.audit_log table

import { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/client';
import { log } from "../lib/logger";

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
 * GO-LIVE-140: Extract action and resource info from request
 * Enhanced to capture 10+ admin operation types
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

  let action = 'unknown';
  let resourceType = 'unknown';
  let resourceId: string | null = null;
  let storeId: string | null = null;

  // =============================================================================
  // GO-LIVE-143: Store operations
  // =============================================================================
  if (segments[0] === 'stores') {
    storeId = segments[1] || null;

    if (segments.length === 1) {
      resourceType = 'store';
      action = method === 'POST' ? 'store.create' : 'store.list';
    } else if (segments.length === 2) {
      resourceType = 'store';
      resourceId = segments[1];
      action =
        method === 'GET' ? 'store.get' :
        method === 'PUT' || method === 'PATCH' ? 'store.update' :
        method === 'DELETE' ? 'store.delete' : 'store.unknown';
    } else if (segments[2] === 'users') {
      resourceType = 'user';
      resourceId = segments[3] || null;
      action =
        segments.length === 3
          ? method === 'POST' ? 'user.create' : 'user.list'
          : method === 'GET' ? 'user.get' :
            method === 'PATCH' ? 'user.update' :
            method === 'DELETE' ? 'user.delete' : 'user.unknown';
    } else if (segments[2] === 'devices') {
      resourceType = 'device';
      action = 'device.list';
    } else if (segments[2] === 'device-enrollments') {
      resourceType = 'enrollment';
      resourceId = segments[3] || null;
      action = method === 'POST' ? 'enrollment.create' : 'enrollment.list';
    }
  }
  // =============================================================================
  // Device operations
  // =============================================================================
  else if (segments[0] === 'devices') {
    resourceType = 'device';
    resourceId = segments[1] || null;
    if (segments[2] === 'block') action = 'device.block';
    else if (segments[2] === 'unblock') action = 'device.unblock';
    else if (method === 'GET') action = 'device.get';
    else if (method === 'DELETE') action = 'device.revoke';
  }
  else if (segments[0] === 'device-enrollments') {
    resourceType = 'enrollment';
    resourceId = segments[1] || null;
    if (segments[2] === 'revoke') action = 'enrollment.revoke';
    else if (method === 'GET') action = 'enrollment.list';
    else if (method === 'POST') action = 'enrollment.create';
  }
  // =============================================================================
  // GO-LIVE-141: Supplier operations
  // =============================================================================
  else if (segments[0] === 'pending-suppliers') {
    resourceType = 'supplier_request';
    resourceId = segments[1] || null;
    if (segments[2] === 'verify') action = 'supplier_request.verify';
    else if (segments[2] === 'reject') action = 'supplier_request.reject';
    else action = method === 'GET' ? 'supplier_request.list' : 'supplier_request.unknown';
  }
  else if (segments[0] === 'verified-suppliers') {
    resourceType = 'supplier';
    action = 'supplier.list_verified';
  }
  else if (segments[0] === 'suppliers') {
    resourceType = 'supplier';
    resourceId = segments[1] || null;
    if (segments[1] === 'pending') {
      action = 'supplier.list_pending';
    } else if (segments[2] === 'approve') {
      action = 'supplier.approve';
    } else if (segments[2] === 'reject') {
      action = 'supplier.reject';
    } else if (method === 'GET') {
      action = segments.length === 1 ? 'supplier.list' : 'supplier.get';
    }
  }
  // =============================================================================
  // GO-LIVE-142: Product operations
  // =============================================================================
  else if (segments[0] === 'products') {
    resourceType = 'product';
    resourceId = segments[1] || null;
    if (segments[1] === 'pending') {
      action = 'product.list_pending';
    } else if (segments[2] === 'approve') {
      action = 'product.approve';
    } else if (segments[2] === 'reject') {
      action = 'product.reject';
    } else if (segments[2] === 'edit') {
      action = 'product.edit';
    } else if (method === 'GET') {
      action = segments.length === 1 ? 'product.list' : 'product.get';
    } else if (method === 'POST') {
      action = 'product.create';
    } else if (method === 'PUT' || method === 'PATCH') {
      action = 'product.update';
    } else if (method === 'DELETE') {
      action = 'product.delete';
    }
  }
  else if (segments[0] === 'global-products') {
    resourceType = 'global_product';
    resourceId = segments[1] || null;
    action = method === 'GET' ? 'global_product.list' :
             method === 'POST' ? 'global_product.create' :
             method === 'PUT' || method === 'PATCH' ? 'global_product.update' :
             method === 'DELETE' ? 'global_product.delete' : 'global_product.unknown';
  }
  // =============================================================================
  // GO-LIVE-140: User and permission operations
  // =============================================================================
  else if (segments[0] === 'users') {
    resourceType = 'admin_user';
    resourceId = segments[1] || null;
    if (segments[2] === 'permissions') {
      action = method === 'GET' ? 'user.permissions.get' :
               method === 'PUT' ? 'user.permissions.update' : 'user.permissions.unknown';
    } else if (segments[2] === 'role') {
      action = 'user.role.update';
    } else {
      action = method === 'GET' ? (segments.length === 1 ? 'user.list' : 'user.get') :
               method === 'POST' ? 'user.create' :
               method === 'PATCH' ? 'user.update' :
               method === 'DELETE' ? 'user.delete' : 'user.unknown';
    }
  }
  // =============================================================================
  // Settings and configuration operations
  // =============================================================================
  else if (segments[0] === 'settings') {
    resourceType = 'settings';
    resourceId = segments[1] || null;
    action = method === 'GET' ? 'settings.get' :
             method === 'PUT' || method === 'PATCH' ? 'settings.update' : 'settings.unknown';
  }
  // =============================================================================
  // OTP operations (GO-LIVE-140: 2FA administration)
  // =============================================================================
  else if (segments[0] === 'otp') {
    resourceType = 'otp';
    if (segments[1] === 'request') action = 'otp.request';
    else if (segments[1] === 'verify') action = 'otp.verify';
    else action = 'otp.unknown';
  }
  // =============================================================================
  // Analytics and reports
  // =============================================================================
  else if (segments[0] === 'analytics') {
    resourceType = 'analytics';
    resourceId = segments[1] || null;
    action = 'analytics.view';
  }
  else if (segments[0] === 'pos-events') {
    resourceType = 'pos_events';
    action = method === 'GET' ? 'pos_events.list' : 'pos_events.unknown';
  }
  // =============================================================================
  // GST credits (GO-LIVE-097)
  // =============================================================================
  else if (segments[0] === 'gst-credits') {
    resourceType = 'gst_credits';
    resourceId = segments[1] || null;
    action = method === 'GET' ? 'gst_credits.list' :
             method === 'POST' ? 'gst_credits.claim' :
             method === 'PUT' ? 'gst_credits.update' : 'gst_credits.unknown';
  }
  // =============================================================================
  // Barcode sheets
  // =============================================================================
  else if (segments[0] === 'barcode-sheets') {
    resourceType = 'barcode_sheet';
    resourceId = segments[1] || null;
    action = method === 'GET' ? 'barcode_sheet.list' :
             method === 'POST' ? 'barcode_sheet.generate' : 'barcode_sheet.unknown';
  }
  // =============================================================================
  // Audit log access
  // =============================================================================
  else if (segments[0] === 'audit') {
    resourceType = 'audit_log';
    action = 'audit.view';
  }
  // =============================================================================
  // AI operations
  // =============================================================================
  else if (segments[0] === 'ai') {
    resourceType = 'ai';
    action = segments[1] ? `ai.${segments[1]}` : 'ai.unknown';
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
    if (!pool) return; // No DB connection available
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
    log.error('[AdminAudit] Failed to write audit log:', error);
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
