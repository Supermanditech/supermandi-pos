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

// =============================================================================
// GO-LIVE-193: Client-side rate limiting
// Prevents the app from overwhelming the backend with excessive requests
// =============================================================================

interface RateLimitEntry {
  timestamps: number[];
  backoffUntil: number; // If we get a 429, backoff until this time
}

// Rate limit configuration per endpoint category
const RATE_LIMIT_CONFIG: Record<string, { windowMs: number; maxRequests: number }> = {
  sales: { windowMs: 60000, maxRequests: 60 },       // 60 per minute (matches server)
  scan: { windowMs: 10000, maxRequests: 30 },        // 30 per 10 seconds
  voice: { windowMs: 60000, maxRequests: 20 },       // 20 per minute (AI is expensive)
  sync: { windowMs: 60000, maxRequests: 30 },        // 30 per minute
  default: { windowMs: 60000, maxRequests: 100 },    // 100 per minute for misc endpoints
};

// Endpoint category mapping
function getEndpointCategory(path: string): string {
  if (path.includes('/sales') || path.includes('/payment')) return 'sales';
  if (path.includes('/scan') || path.includes('/barcode')) return 'scan';
  if (path.includes('/voice') || path.includes('/ai/')) return 'voice';
  if (path.includes('/sync') || path.includes('/batch')) return 'sync';
  return 'default';
}

// Rate limit state (in-memory, resets on app restart)
const rateLimitState = new Map<string, RateLimitEntry>();

// GO-LIVE-193: Periodic cleanup of rate limit state (every 5 minutes)
let lastRateLimitCleanup = Date.now();
const RATE_LIMIT_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

function cleanupRateLimitState(): void {
  const now = Date.now();
  if (now - lastRateLimitCleanup < RATE_LIMIT_CLEANUP_INTERVAL) return;

  lastRateLimitCleanup = now;
  const staleThreshold = now - 10 * 60 * 1000; // 10 minutes

  for (const [key, entry] of rateLimitState.entries()) {
    // Remove entries with no recent activity
    const latestTimestamp = Math.max(...entry.timestamps, 0);
    if (latestTimestamp < staleThreshold && entry.backoffUntil < now) {
      rateLimitState.delete(key);
    }
  }
}

/**
 * GO-LIVE-193: Check if a request should be rate limited on the client side
 * Returns null if allowed, or an error message if blocked
 */
function checkClientRateLimit(path: string): string | null {
  // Run periodic cleanup
  cleanupRateLimitState();

  const category = getEndpointCategory(path);
  const config = RATE_LIMIT_CONFIG[category] || RATE_LIMIT_CONFIG.default;
  const now = Date.now();

  // Get or create entry
  let entry = rateLimitState.get(category);
  if (!entry) {
    entry = { timestamps: [], backoffUntil: 0 };
    rateLimitState.set(category, entry);
  }

  // Check if we're in backoff period (from a previous 429)
  if (entry.backoffUntil > now) {
    const waitSeconds = Math.ceil((entry.backoffUntil - now) / 1000);
    return `Rate limited. Please wait ${waitSeconds}s.`;
  }

  // Filter timestamps within the window
  entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);

  // Check if over limit
  if (entry.timestamps.length >= config.maxRequests) {
    // Don't block, but log a warning - server will handle it
    console.warn(`[GO-LIVE-193] Client rate limit warning: ${category} at ${entry.timestamps.length}/${config.maxRequests} requests`);
    // Only block if significantly over limit (2x)
    if (entry.timestamps.length >= config.maxRequests * 2) {
      return `Too many requests. Please wait a moment.`;
    }
  }

  // Add current timestamp
  entry.timestamps.push(now);

  return null; // Allowed
}

/**
 * BATCH5-SUGGESTION-7: Add jitter to backoff to prevent thundering herd
 * Jitter range: 0.7 to 1.3 (±30%)
 */
function addJitter(ms: number): number {
  const jitterFactor = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
  return Math.floor(ms * jitterFactor);
}

/**
 * GO-LIVE-193: Handle 429 response by setting backoff period
 * BATCH5-SUGGESTION-7: Added jitter to prevent retry storms
 */
function handleRateLimitResponse(path: string, retryAfterSeconds?: number): void {
  const category = getEndpointCategory(path);
  let entry = rateLimitState.get(category);
  if (!entry) {
    entry = { timestamps: [], backoffUntil: 0 };
    rateLimitState.set(category, entry);
  }

  // Default to 5 seconds if no Retry-After header
  const baseBackoffMs = (retryAfterSeconds ?? 5) * 1000;
  // BATCH5-SUGGESTION-7: Add jitter to prevent all devices retrying at the same time
  const backoffMs = addJitter(baseBackoffMs);
  entry.backoffUntil = Date.now() + backoffMs;

  console.log(`[GO-LIVE-193] Rate limited by server for ${category}, backing off for ${backoffMs}ms (base: ${baseBackoffMs}ms)`);
}

// GO-LIVE-169: Response validation utilities
function validateResponseStructure(parsed: unknown, path: string): void {
  // Warn if response is completely empty when we expect data
  if (parsed === null || parsed === undefined) {
    console.warn(`[GO-LIVE-169] API response is null/undefined for ${path}`);
    return;
  }

  // Check for unexpected error field in success response (indicates backend issue)
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if ('error' in obj && obj.error) {
      console.error(`[GO-LIVE-169] Unexpected error field in success response for ${path}:`, obj.error);
    }
  }

  // Warn if response is a primitive when object expected (common backend bug)
  if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
    console.warn(`[GO-LIVE-169] API response is primitive (${typeof parsed}) for ${path}, expected object/array`);
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

  // GO-LIVE-193: Check client-side rate limit
  const rateLimitError = checkClientRateLimit(path);
  if (rateLimitError) {
    console.warn(`[GO-LIVE-193] Client-side rate limit blocked request to ${path}: ${rateLimitError}`);
    throw new ApiError(429, "CLIENT_RATE_LIMITED", {
      error: { code: "CLIENT_RATE_LIMITED", message: rateLimitError }
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

    // GO-LIVE-169: Parse with error handling
    let parsed: unknown;
    try {
      parsed = text ? (JSON.parse(text) as unknown) : undefined;
    } catch (parseError) {
      console.error(`[GO-LIVE-169] JSON parse error for ${path}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      console.error(`[GO-LIVE-169] Response text (first 200 chars): ${text?.slice(0, 200)}`);
      throw new ApiError(res.status, 'INVALID_JSON_RESPONSE', { rawText: text?.slice(0, 500) });
    }

    if (!res.ok) {
      // GO-LIVE-193: Handle 429 rate limit response
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
        handleRateLimitResponse(path, retryAfterSeconds);
      }

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

    // GO-LIVE-169: Validate response structure
    validateResponseStructure(parsed, path);

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

