const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
import { getAdminToken } from "./authToken";

export type StoreRecord = {
  id: string;
  name?: string | null;
  storeName?: string | null;
  upi_vpa?: string | null;
  active?: boolean;
  address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  location?: string | null;
  pos_device_id?: string | null;
  kyc_status?: string | null;
  upi_vpa_updated_at?: string | null;
  upi_vpa_updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }
  return API_BASE;
}

async function parseError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  if (data && typeof data === "object" && "error" in data) {
    return String((data as any).error);
  }
  return `Request failed (${res.status})`;
}

export async function fetchStore(storeId: string): Promise<StoreRecord> {
  const base = requireApiBase();
  const token = getAdminToken();

  const res = await fetch(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { "x-admin-token": token } : {})
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  return (data?.store ?? {}) as StoreRecord;
}

export async function fetchStores(): Promise<StoreRecord[]> {
  const base = requireApiBase();
  const token = getAdminToken();

  const res = await fetch(`${base}/api/v1/admin/stores`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { "x-admin-token": token } : {})
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  return Array.isArray(data?.stores) ? (data.stores as StoreRecord[]) : [];
}

export async function createStore(input: { storeName: string; storeId?: string }): Promise<StoreRecord> {
  const base = requireApiBase();
  const token = getAdminToken();

  const payload: Record<string, unknown> = { storeName: input.storeName };
  if (input.storeId) payload.storeId = input.storeId;

  const res = await fetch(`${base}/api/v1/admin/stores`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "x-admin-token": token } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  return (data?.store ?? {}) as StoreRecord;
}

export async function updateStore(
  storeId: string,
  input: { upiVpa?: string; storeName?: string }
): Promise<StoreRecord> {
  const base = requireApiBase();
  const token = getAdminToken();

  const res = await fetch(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}`, {
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

  const data = await res.json();
  return (data?.store ?? {}) as StoreRecord;
}
