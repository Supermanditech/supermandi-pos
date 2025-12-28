const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
import { getAdminToken } from "./authToken";

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }
  return API_BASE;
}

export async function askAi(question: string): Promise<{ answer: string }> {
  const base = requireApiBase();
  const q = question.trim();
  if (!q) throw new Error("Question is required");
  const token = getAdminToken();

  const res = await fetch(`${base}/api/v1/admin/ai/ask`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "X-Admin-Token": token } : {})
    },
    body: JSON.stringify({ question: q })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized (set VITE_ADMIN_TOKEN to match backend ADMIN_TOKEN)");
    }
    const msg = (data && typeof data === "object" && "error" in data ? String((data as any).error) : `AI failed (${res.status})`);
    throw new Error(msg);
  }

  return { answer: String((data as any).answer ?? "") };
}

