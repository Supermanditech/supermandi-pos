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

// GO-LIVE FIX: Define protected endpoint patterns that REQUIRE device token
// Requests to these endpoints will be blocked if token is missing (not sent with empty token)
const PROTECTED_ENDPOINT_PATTERNS = [
  /^\/api\/v1\/pos\//,
  /^\/api\/v1\/reorder\//,
  /^\/api\/v1\/catalog\//,
  /^\/api\/v1\/inventory\//,
];

// GO-LIVE FIX: Public endpoints that do NOT require device token
// These endpoints must work without authentication (e.g., enrollment creates the token)
const PUBLIC_ENDPOINT_PATTERNS = [
  /^\/api\/v1\/pos\/enroll$/,  // Enrollment endpoint - creates the device token
];

// GO-LIVE FIX: Check if an endpoint requires device token authentication
function isProtectedEndpoint(path: string): boolean {
  // First check if it's a public endpoint (allowlist takes precedence)
  if (PUBLIC_ENDPOINT_PATTERNS.some(pattern => pattern.test(path))) {
    return false;
  }
  return PROTECTED_ENDPOINT_PATTERNS.some(pattern => pattern.test(path));
}

// GO-LIVE: Runtime assertion to verify guard rules (DEV only)
// Ticket: POS-ENROLL-401-FIX - Regression-proofing
if (__DEV__) {
  const assertions = [
    { path: "/api/v1/pos/enroll", expected: false, desc: "enroll must be PUBLIC" },
    { path: "/api/v1/pos/ui-status", expected: true, desc: "ui-status must be PROTECTED" },
    { path: "/api/v1/pos/orders", expected: true, desc: "orders must be PROTECTED" },
    { path: "/api/v1/reorder/suggest", expected: true, desc: "reorder must be PROTECTED" },
  ];
  for (const { path, expected, desc } of assertions) {
    const actual = isProtectedEndpoint(path);
    if (actual !== expected) {
      console.error(`[apiClient] GUARD RULE VIOLATION: ${desc} - got ${actual}, expected ${expected}`);
    }
  }
  console.log("[apiClient] Guard rule assertions passed");
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

// GL-CRIT-0043: Default timeout for API requests (30 seconds)
const API_TIMEOUT_MS = 30000;

async function requestJson<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const token = await getAuthToken();
  const deviceToken = await getDeviceToken();
  // I18N-008: Include locale in Accept-Language header
  const locale = i18n.language || "en";

  const fullUrl = `${API_BASE_URL}${path}`;
  console.log(`[api_debug] ${method} ${fullUrl}`);
  // GO-LIVE DEBUG: Log token length to verify full token is being sent
  console.log(`[api_debug] X-Device-Token: ${deviceToken ? `${deviceToken.slice(0, 8)}...(len=${deviceToken.length})` : "none"}`);
  if (body) console.log(`[api_debug] body: ${JSON.stringify(body).slice(0, 200)}`);

  // GO-LIVE FIX: Block requests to protected endpoints if token is missing
  // This prevents 401 errors from being sent with empty token
  if (isProtectedEndpoint(path) && !deviceToken) {
    console.error(`[api_debug] BLOCKED: Protected endpoint ${path} called without device token`);
    throw new ApiError(401, "DEVICE_SESSION_MISSING", {
      error: "DEVICE_SESSION_MISSING",
      message: "Device token is required but not available. Please re-enroll the device."
    });
  }

  // GL-CRIT-0043: Add timeout using AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    // CACHE-000: Prevent stale API responses from HTTP cache
    const res = await fetch(fullUrl, {
      method,
      cache: "no-store",
      signal: controller.signal,
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
  } finally {
    // GL-CRIT-0043: Always clear the timeout to prevent memory leaks
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  get: <T>(path: string) => requestJson<T>("GET", path),
  post: <T>(path: string, body?: unknown) => requestJson<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => requestJson<T>("PATCH", path, body),
  del: <T>(path: string) => requestJson<T>("DELETE", path)
};

