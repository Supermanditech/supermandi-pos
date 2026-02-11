// DOCS-001: Document management API client for SuperAdmin
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

export type DocumentStatus = "pending" | "approved" | "rejected";

export type DocumentRecord = {
  id: string;
  entity_type: "store" | "supplier";
  entity_id: string;
  entity_name?: string | null;
  owner_name?: string | null;
  entity_status?: string | null;
  document_type: string;
  file_name: string;
  file_size: number;
  content_type: string;
  status: DocumentStatus;
  rejection_reason?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  uploaded_at: string;
  created_at?: string;
  is_deleted?: boolean;
  view_url: string;
  audit_history?: Array<{
    action: string;
    old_status?: string;
    new_status?: string;
    reason?: string;
    created_at: string;
  }>;
};

export type PendingDocumentsResponse = {
  documents: DocumentRecord[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
};

export type EntityDocumentsResponse = {
  entity_type: string;
  entity_id: string;
  entity_info?: Record<string, unknown>;
  documents: DocumentRecord[];
};

function requireApiBase(): string {
  return API_BASE;
}

async function parseError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  const data = await res.json().catch(() => ({}));
  if (data && typeof data === "object" && "error" in data) {
    return sanitizeErrorMessage(String((data as any).error), fallback);
  }
  if (data && typeof data === "object" && "message" in data) {
    return sanitizeErrorMessage(String((data as any).message), fallback);
  }
  return fallback;
}

/**
 * Fetch pending documents queue
 */
export async function fetchPendingDocuments(
  entityType?: "store" | "supplier",
  limit = 50,
  offset = 0
): Promise<PendingDocumentsResponse> {
  const base = requireApiBase();
  const params = new URLSearchParams();
  if (entityType) params.set("entity_type", entityType);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const res = await fetchWithTimeout(`${base}/api/v1/admin/documents/pending?${params.toString()}`, {
    method: "GET",
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

/**
 * Fetch a single document's details
 */
export async function fetchDocument(documentId: string): Promise<DocumentRecord> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/documents/${encodeURIComponent(documentId)}`, {
    method: "GET",
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

/**
 * Fetch all documents for an entity (store or supplier)
 */
export async function fetchEntityDocuments(
  entityType: "store" | "supplier",
  entityId: string
): Promise<EntityDocumentsResponse> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/documents/entity/${entityType}/${encodeURIComponent(entityId)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...getAuthHeaders(),
      },
    }
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

/**
 * Approve a document
 */
export async function approveDocument(documentId: string): Promise<{ success: boolean; message: string }> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/documents/${encodeURIComponent(documentId)}/verify`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

/**
 * Reject a document with reason
 */
export async function rejectDocument(
  documentId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/documents/${encodeURIComponent(documentId)}/reject`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

/**
 * Get the URL to view/download a document
 */
export function getDocumentViewUrl(documentId: string): string {
  const base = requireApiBase();
  return `${base}/api/v1/documents/${documentId}`;
}
