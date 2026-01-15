import { API_BASE_URL } from "../../config/api";
import { getAuthToken } from "./storage";
import { clearDeviceSession, getDeviceToken } from "../deviceSession";
import i18n from "../../i18n";

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
  const deviceToken = await getDeviceToken();
  // I18N-008: Include locale in Accept-Language header
  const locale = i18n.language || "en";

  const fullUrl = `${API_BASE_URL}${path}`;
  console.log(`[api_debug] ${method} ${fullUrl}`);
  console.log(`[api_debug] X-Device-Token: ${deviceToken ? deviceToken.slice(0, 8) + "..." : "none"}`);
  if (body) console.log(`[api_debug] body: ${JSON.stringify(body).slice(0, 200)}`);

  const res = await fetch(fullUrl, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Language": locale,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(deviceToken ? { "x-device-token": deviceToken } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await res.text();
  console.log(`[api_debug] status: ${res.status}, body: ${text.slice(0, 300)}`);
  const parsed = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    // DEV-071: Handle structured error format { error: { code, message } } or { error: "string" }
    let message = `Request failed (${res.status})`;
    if (parsed && typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const errorField = (parsed as any).error;
      if (typeof errorField === "string") {
        // Legacy format: { error: "string" }
        message = errorField;
      } else if (typeof errorField === "object" && errorField !== null && "code" in errorField) {
        // New format: { error: { code: "...", message: "..." } }
        message = errorField.code;
      }
    }
    if (message === "device_unauthorized") {
      await clearDeviceSession();
    }
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

