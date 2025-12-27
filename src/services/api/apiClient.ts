import { API_BASE_URL } from "../../config/api";
import { getAuthToken } from "./storage";

export class ApiError extends Error {
  public readonly status: number;
  public readonly payload?: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function requestJson<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === "object" && parsed !== null && "error" in parsed && typeof (parsed as any).error === "string"
        ? (parsed as any).error
        : `Request failed (${res.status})`);
    throw new ApiError(res.status, message, parsed);
  }

  return parsed as T;
}

export const apiClient = {
  get: <T>(path: string) => requestJson<T>("GET", path),
  post: <T>(path: string, body?: unknown) => requestJson<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => requestJson<T>("PATCH", path, body),
  del: <T>(path: string) => requestJson<T>("DELETE", path)
};

