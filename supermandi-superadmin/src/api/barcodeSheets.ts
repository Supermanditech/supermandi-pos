import { getAdminToken } from "./authToken";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }
  return API_BASE;
}

export async function fetchBarcodeSheetPdf(params: {
  storeId: string;
  tier: "tier1" | "tier2";
}): Promise<Blob> {
  const base = requireApiBase();
  const token = getAdminToken();
  const qs = new URLSearchParams();
  qs.set("storeId", params.storeId);
  qs.set("tier", params.tier);

  const res = await fetch(`${base}/api/v1/admin/barcode-sheets?${qs.toString()}`, {
    headers: {
      Accept: "application/pdf",
      ...(token ? { "x-admin-token": token } : {})
    }
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error("Unauthorized (set VITE_ADMIN_TOKEN to match backend ADMIN_TOKEN)");
    }
    const msg =
      (data && typeof data === "object" && "error" in data
        ? String((data as any).error)
        : `Request failed (${res.status})`);
    throw new Error(msg);
  }

  return res.blob();
}
