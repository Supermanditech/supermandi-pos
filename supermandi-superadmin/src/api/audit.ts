// GL-CRIT-0049: Audit Log API
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

export type AuditLogRecord = {
  id: string;
  actor_user_id: string | null;
  actor_ip: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  store_id: string | null;
  request_body: Record<string, unknown> | null;
  response_status: number | null;
  error_message: string | null;
  created_at: string;
};

export type AuditLogsResponse = {
  logs: AuditLogRecord[];
  total: number;
  limit: number;
  offset: number;
};

export type AuditStatsResponse = {
  actions: Array<{ action: string; count: string }>;
  summary: {
    total_logs: string;
    error_count: string;
    unique_actors: string;
  };
};

async function parseError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 503 && data.error === "admin_disabled") return "Admin disabled (ADMIN_TOKEN missing)";
  // POST-BATCH-018-FIX-002: No hard redirect — let caller handle auth errors
  if (res.status === 401) {
    return "Unauthorized — session may have expired";
  }
  return sanitizeErrorMessage(data.error, fallback);
}

export async function fetchAuditLogs(params?: {
  limit?: number;
  offset?: number;
  action?: string;
  resource_type?: string;
  from_date?: string;
  to_date?: string;
}): Promise<AuditLogsResponse> {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing");
  }

  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.action) qs.set("action", params.action);
  if (params?.resource_type) qs.set("resource_type", params.resource_type);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);

  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/audit?${qs.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

export async function fetchAuditStats(): Promise<AuditStatsResponse> {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing");
  }

  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/audit/stats`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

// GL-CRIT-0049: Create audit log entry for admin actions
export type AuditLogInput = {
  action: string;
  resource_type: string;
  resource_id?: string | null;
  store_id?: string | null;
  request_body?: Record<string, unknown> | null;
  response_status?: number | null;
  error_message?: string | null;
};

/**
 * GL-CRIT-0049: Log an admin action to the audit trail
 * This should be called after every mutation action in SuperAdmin
 */
export async function createAuditLog(input: AuditLogInput): Promise<void> {
  if (!API_BASE) {
    console.warn('GL-CRIT-0049: Cannot log audit - VITE_API_BASE_URL missing');
    return;
  }

  const authHeaders = getAuthHeaders();
  if (Object.keys(authHeaders).length === 0) {
    console.warn('GL-CRIT-0049: Cannot log audit - no admin token');
    return;
  }

  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      console.warn('GL-CRIT-0049: Audit log failed:', res.status);
    }
  } catch (err) {
    // Don't throw - audit failures shouldn't block the action
    console.warn('GL-CRIT-0049: Audit log error:', err);
  }
}

/**
 * GL-CRIT-0049: Helper to log successful admin action
 */
export function logAdminAction(
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>
): void {
  createAuditLog({
    action,
    resource_type: resourceType,
    resource_id: resourceId || null,
    request_body: details || null,
    response_status: 200,
  });
}

/**
 * GL-CRIT-0049: Helper to log failed admin action
 */
export function logAdminActionError(
  action: string,
  resourceType: string,
  resourceId?: string,
  errorMessage?: string
): void {
  createAuditLog({
    action,
    resource_type: resourceType,
    resource_id: resourceId || null,
    response_status: 500,
    error_message: errorMessage || 'Unknown error',
  });
}
