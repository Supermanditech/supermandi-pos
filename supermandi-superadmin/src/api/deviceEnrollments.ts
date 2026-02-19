const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

export type DeviceEnrollmentResponse = {
  code: string;
  expiresAt: string;
  qrPayload: string;
  maxUses?: number;
  isDemo?: boolean;
};

// SA-ENROLL-UX G5: Type for enrollment records from listing endpoint
export type EnrollmentRecord = {
  id: string;
  code: string;
  store_id: string;
  store_name?: string | null;
  store_code?: string | null;
  expires_at: string;
  max_uses: number;
  uses_count: number;
  created_at: string;
  created_by: string;
  revoked_at: string | null;
  used_at: string | null;
  last_used_at: string | null;
  status: "ACTIVE" | "EXPIRED" | "USED" | "REVOKED";
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

// SA-ENROLL-UX G2: Revoke an enrollment code
export async function revokeEnrollmentCode(code: string): Promise<{ success: boolean }> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/device-enrollments/${encodeURIComponent(code)}/revoke`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return (await res.json()) as { success: boolean };
}

// SA-ENROLL-UX G5: Fetch enrollment codes for a specific store
export async function fetchStoreEnrollments(storeId: string): Promise<EnrollmentRecord[]> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/device-enrollments?storeId=${encodeURIComponent(storeId)}&limit=20`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...getAuthHeaders()
      }
    }
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json()) as { enrollments: EnrollmentRecord[] };
  return data.enrollments;
}

// #329-332: Resend welcome message — download links + activation instructions (WhatsApp + SMS + Email)
export async function resendEnrollmentCode(code: string): Promise<{ sent: boolean; channels: string[]; sentTo?: string }> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/device-enrollments/${encodeURIComponent(code)}/resend`, {
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

  return (await res.json()) as { sent: boolean; channels: string[]; sentTo?: string };
}
