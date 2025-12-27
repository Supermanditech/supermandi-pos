import { apiClient } from "./apiClient";
import { setAuthToken } from "./storage";

export async function login(email: string, password: string): Promise<void> {
  const res = await apiClient.post<{ token: string }>("/api/auth/login", { email, password });
  await setAuthToken(res.token);
}

export async function register(email: string, password: string, name?: string): Promise<void> {
  await apiClient.post("/api/auth/register", { email, password, name });
}

export async function me(): Promise<{ user: { id: string; email: string; role: string } }>{
  return apiClient.get("/api/auth/me");
}

