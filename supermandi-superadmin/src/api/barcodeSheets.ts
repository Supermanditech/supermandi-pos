import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

function requireApiBase(): string {
  return API_BASE;
}

export async function fetchBarcodeSheetPdf(params: {
  storeId: string;
  tier: "tier1" | "tier2";
}): Promise<Blob> {
  const base = requireApiBase();
    const qs = new URLSearchParams();
  qs.set("storeId", params.storeId);
  qs.set("tier", params.tier);

  const res = await fetchWithTimeout(`${base}/api/v1/admin/barcode-sheets?${qs.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/pdf",
      ...getAuthHeaders()
    }
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // POST-BATCH-018-FIX-002: No hard redirect — let caller handle auth errors
    if (res.status === 401) {
      throw new Error("Unauthorized — session may have expired");
    }
    const fallback = `Request failed (${res.status})`;
    // GL-CRIT-0055: Sanitize error messages
    // R4-TS-001: Type-safe narrowing instead of `as any`
    const rawError = data && typeof data === "object" && "error" in data
      ? String((data as Record<string, unknown>).error)
      : null;
    throw new Error(sanitizeErrorMessage(rawError, fallback));
  }

  return res.blob();
}
