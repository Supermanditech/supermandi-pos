const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
import { getAdminToken } from "./authToken";

export type DeviceEnrollmentResponse = {
  code: string;
  expiresAt: string;
  qrPayload: string;
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

export async function createDeviceEnrollment(storeId: string): Promise<DeviceEnrollmentResponse> {
  const base = requireApiBase();
  const token = getAdminToken();

  const res = await fetch(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/device-enrollments`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "x-admin-token": token } : {})
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return (await res.json()) as DeviceEnrollmentResponse;
}
