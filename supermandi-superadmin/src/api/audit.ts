// GL-CRIT-0049: Audit Log API
import { getAdminToken } from "./authToken";
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
  if (res.status === 401) return "Unauthorized";
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

  const token = getAdminToken();
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.action) qs.set("action", params.action);
  if (params?.resource_type) qs.set("resource_type", params.resource_type);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);

  const res = await fetch(`${API_BASE}/api/v1/admin/audit?${qs.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(token ? { "x-admin-token": token } : {}),
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

  const token = getAdminToken();
  const res = await fetch(`${API_BASE}/api/v1/admin/audit/stats`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(token ? { "x-admin-token": token } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}
