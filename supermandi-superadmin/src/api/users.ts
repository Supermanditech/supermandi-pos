// ADM-SCR-002: Users API Module
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export type UserRecord = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  actor_type: string;
  actor_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

async function parseError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 503 && data.error === "admin_disabled") return "Admin service unavailable";
  if (res.status === 401) return "Session expired or unauthorized. Please log in again.";
  // GL-CRIT-0055: Sanitize error messages
  return sanitizeErrorMessage(data.error, fallback);
}

// ADMIN-PAGINATION-001: Paginated response type
export type PaginatedResponse<T> = { items: T[]; total: number; limit: number; offset: number };

export async function fetchUsers(params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<UserRecord>> {
  const url = new URL(`${API_BASE}/api/v1/admin/users`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetchWithTimeout(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { users?: UserRecord[]; total?: number; limit?: number; offset?: number };
  return {
    items: Array.isArray(data.users) ? data.users : [],
    total: data.total ?? 0,
    limit: data.limit ?? 50,
    offset: data.offset ?? 0,
  };
}

export type UserPatchInput = {
  status?: "active" | "inactive" | "suspended";
};

export async function patchUser(userId: string, input: UserPatchInput): Promise<UserRecord> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { user?: UserRecord };
  if (!data.user) {
    throw new Error("User response missing");
  }
  return data.user;
}

// SA-1.3-004: Create a new user
// GL-CRIT-0053: Add admin_verification for platform user creation
export type UserCreateInput = {
  name: string;
  email?: string;
  phone?: string;
  actor_type?: string;
  actor_id?: string;
  admin_verification?: {
    reason: string;
    confirmed: boolean;
  };
};

export async function createUser(input: UserCreateInput): Promise<UserRecord> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/users`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { user?: UserRecord };
  if (!data.user) {
    throw new Error("User response missing");
  }
  return data.user;
}
