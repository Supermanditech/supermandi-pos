// SA-P0-003: Price Bounds API
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export type PriceBounds = {
  minPricePaise: number;
  maxPricePaise: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function fetchPriceBounds(): Promise<PriceBounds> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/price-bounds`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  if (!data?.priceBounds || typeof data.priceBounds !== "object") {
    throw new Error("Invalid price bounds response");
  }
  return data.priceBounds as PriceBounds;
}

export async function updatePriceBounds(
  minPricePaise: number,
  maxPricePaise: number
): Promise<PriceBounds> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/price-bounds`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ minPricePaise, maxPricePaise }),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  if (!data?.priceBounds || typeof data.priceBounds !== "object") {
    throw new Error("Invalid price bounds update response");
  }
  return data.priceBounds as PriceBounds;
}
