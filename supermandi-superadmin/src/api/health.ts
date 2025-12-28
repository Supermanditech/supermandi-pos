const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
import { getAdminToken } from "./authToken";

export type HealthResponse = { status: string };

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }
  return API_BASE;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const base = requireApiBase();
  const token = getAdminToken();
  const res = await fetch(`${base}/health`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { "X-Admin-Token": token } : {})
    }
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized (set VITE_ADMIN_TOKEN to match backend ADMIN_TOKEN)");
    }
    throw new Error(`Health check failed (${res.status})`);
  }

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== "object" || !("status" in data)) {
    throw new Error("Invalid /health response");
  }

  const status = (data as any).status;
  return { status: String(status) };
}

