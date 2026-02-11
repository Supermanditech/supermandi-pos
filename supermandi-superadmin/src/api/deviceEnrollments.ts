const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

export type DeviceEnrollmentResponse = {
  code: string;
  expiresAt: string;
  qrPayload: string;
};

function requireApiBase(): string {
  return API_BASE;
}

async function parseError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  const data = await res.json().catch(() => ({}));
  if (data && typeof data === "object" && "error" in data) {
    // GL-CRIT-0055: Sanitize error messages
    return sanitizeErrorMessage(String((data as any).error), fallback);
  }
  return fallback;
}

export async function createDeviceEnrollment(storeId: string): Promise<DeviceEnrollmentResponse> {
  const base = requireApiBase();
  
  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/device-enrollments`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return (await res.json()) as DeviceEnrollmentResponse;
}
