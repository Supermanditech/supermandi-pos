const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

function requireApiBase(): string {
  return API_BASE;
}

export async function askAi(question: string): Promise<{ answer: string }> {
  const base = requireApiBase();
  const q = question.trim();
  if (!q) throw new Error("Question is required");
  
  const res = await fetchWithTimeout(`${base}/api/v1/admin/ai`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify({ question: q })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // POST-BATCH-018-FIX-002: No hard redirect — let caller handle auth errors
    if (res.status === 401) {
      throw new Error("Unauthorized — session may have expired");
    }
    const msg = (data && typeof data === "object" && "error" in data ? String((data as any).error) : `AI failed (${res.status})`);
    throw new Error(msg);
  }

  return { answer: String((data as any).answer ?? "") };
}

export async function fetchAiHealth(): Promise<{ configured: boolean }> {
  const base = requireApiBase();
    const res = await fetchWithTimeout(`${base}/api/v1/admin/ai/health`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders()
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // POST-BATCH-018-FIX-002: No hard redirect — let caller handle auth errors
    if (res.status === 401) {
      throw new Error("Unauthorized — session may have expired");
    }
    const msg = (data && typeof data === "object" && "error" in data ? String((data as any).error) : `AI health failed (${res.status})`);
    throw new Error(msg);
  }
  return { configured: Boolean((data as any).configured) };
}

