// ADM-SCR-002: Users API Module
import { getAdminToken } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

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
  if (res.status === 503 && data.error === "admin_disabled") return "Admin disabled (ADMIN_TOKEN missing)";
  if (res.status === 401) return "Unauthorized (set VITE_ADMIN_TOKEN to match backend ADMIN_TOKEN)";
  // GL-CRIT-0055: Sanitize error messages
  return sanitizeErrorMessage(data.error, fallback);
}

export async function fetchUsers(): Promise<UserRecord[]> {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }

  const token = getAdminToken();
  const res = await fetch(`${API_BASE}/api/v1/admin/users`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(token ? { "x-admin-token": token } : {})
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { users?: UserRecord[] };
  return Array.isArray(data.users) ? data.users : [];
}

export type UserPatchInput = {
  status?: "active" | "inactive" | "suspended";
};

export async function patchUser(userId: string, input: UserPatchInput): Promise<UserRecord> {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }

  const token = getAdminToken();
  const res = await fetch(`${API_BASE}/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "x-admin-token": token } : {})
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
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }

  const token = getAdminToken();
  const res = await fetch(`${API_BASE}/api/v1/admin/users`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "x-admin-token": token } : {})
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
