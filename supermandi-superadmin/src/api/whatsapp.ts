// WA-002: SuperAdmin WhatsApp API client
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export interface WhatsAppLogEntry {
  id: string;
  storeId: string | null;
  senderType: string;
  recipientType: string;
  recipientPhone: string;
  messageType: string;
  templateName: string | null;
  contentPreview: string | null;
  wamid: string | null;
  deliveryStatus: string;
  deliveryErrorCode: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  contextType: string | null;
  contextId: string | null;
  createdAt: string;
}

export interface WhatsAppStats {
  totalMessages: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  fromPos: number;
  fromAdmin: number;
  last24h: number;
  last7d: number;
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || body?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function fetchWhatsAppStatus(): Promise<{ configured: boolean }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/whatsapp/status`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  return res.json();
}

export async function fetchWhatsAppStats(): Promise<WhatsAppStats> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/whatsapp/stats`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  return res.json();
}

export async function fetchWhatsAppLogs(params?: {
  limit?: number;
  offset?: number;
  senderType?: string;
  recipientType?: string;
  deliveryStatus?: string;
  contextType?: string;
}): Promise<{ data: WhatsAppLogEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.senderType) qs.set("senderType", params.senderType);
  if (params?.recipientType) qs.set("recipientType", params.recipientType);
  if (params?.deliveryStatus) qs.set("deliveryStatus", params.deliveryStatus);
  if (params?.contextType) qs.set("contextType", params.contextType);

  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/whatsapp/logs?${qs}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  return res.json();
}

export async function sendWhatsAppMessage(params: {
  recipientPhone: string;
  message: string;
  recipientType: "retailer" | "supplier";
  contextType?: string;
}): Promise<{ sent: boolean; error?: string; wamid?: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/whatsapp/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
  return data;
}

export async function sendWhatsAppBroadcast(params: {
  phones: string[];
  message: string;
  recipientType: "retailer" | "supplier";
}): Promise<{ sent: number; failed: number; total: number; errors: string[] }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/whatsapp/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  return res.json();
}
