const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

export type DeviceEnrollmentResponse = {
  code: string;
  expiresAt: string;
  qrPayload: string;
};

function requireApiBase(): string {
  return API_BASE;
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
