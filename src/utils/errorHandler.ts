// Error Handler - V3.0.9 compliant
// Utilities for parsing and handling API errors

import { Platform, ToastAndroid, Alert } from "react-native";
import { ApiError } from "../services/api/apiClient";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Standard API error envelope from backend.
 */
export interface ApiErrorEnvelope {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, string | string[]>;
  requestId?: string;
}

/**
 * Parsed error with field-specific details.
 */
export interface ParsedApiError {
  message: string;
  code?: string;
  status: number;
  fieldErrors: Record<string, string>;
  requestId?: string;
  isNetworkError: boolean;
  isAuthError: boolean;
  isValidationError: boolean;
  isNotFound: boolean;
  isConflict: boolean;
  isServerError: boolean;
}

/**
 * Network error for when fetch fails.
 */
export class NetworkError extends Error {
  constructor(message = "Network error. Please check your connection.") {
    super(message);
    this.name = "NetworkError";
  }
}

// =============================================================================
// ERROR PARSING
// =============================================================================

// GL-CRIT-0042: Robust network error detection patterns
const NETWORK_ERROR_PATTERNS = [
  "network",
  "failed to fetch",
  "fetch failed",
  "networkerror",
  "network request failed",
  "unable to connect",
  "connection refused",
  "connection failed",
  "no internet",
  "offline",
  "timeout",
  "timed out",
  "econnrefused",
  "enotfound",
  "dns",
  "socket",
] as const;

function isNetworkErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

function isLikelyNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // AbortError from fetch timeout
  if (error.name === "AbortError") return true;

  // TypeError is commonly thrown by fetch on network failure
  if (error instanceof TypeError) {
    // Check error message for network-related strings
    if (isNetworkErrorMessage(error.message)) return true;
    // On React Native, fetch failures often just say "Network request failed"
    // But can also be generic TypeErrors, so be conservative
    return error.message.includes("request") || error.message.includes("fetch");
  }

  // Check error name for network-related types
  if (error.name === "NetworkError" || error.name === "FetchError") return true;

  // Check message content
  return isNetworkErrorMessage(error.message);
}

/**
 * Parse any error into a standardized ParsedApiError.
 */
export function parseError(error: unknown): ParsedApiError {
  // GL-CRIT-0042: Robust network error detection
  if (isLikelyNetworkError(error)) {
    const isTimeout = error instanceof Error && (
      error.name === "AbortError" ||
      error.message.toLowerCase().includes("timeout") ||
      error.message.toLowerCase().includes("timed out")
    );
    return {
      message: isTimeout
        ? "Request timed out. Please try again."
        : "Network error. Please check your connection.",
      status: 0,
      fieldErrors: {},
      isNetworkError: true,
      isAuthError: false,
      isValidationError: false,
      isNotFound: false,
      isConflict: false,
      isServerError: false,
    };
  }

  if (error instanceof NetworkError) {
    return {
      message: error.message,
      status: 0,
      fieldErrors: {},
      isNetworkError: true,
      isAuthError: false,
      isValidationError: false,
      isNotFound: false,
      isConflict: false,
      isServerError: false,
    };
  }

  // ApiError from our client
  if (error instanceof ApiError) {
    const envelope = error.payload as Partial<ApiErrorEnvelope> | undefined;
    const fieldErrors: Record<string, string> = {};

    // Parse field-specific errors from details
    if (envelope?.details) {
      for (const [field, value] of Object.entries(envelope.details)) {
        if (Array.isArray(value)) {
          fieldErrors[field] = value[0] ?? "Invalid value";
        } else if (typeof value === "string") {
          fieldErrors[field] = value;
        }
      }
    }

    return {
      message: error.message,
      code: envelope?.code,
      status: error.status,
      fieldErrors,
      requestId: envelope?.requestId,
      isNetworkError: false,
      isAuthError: error.status === 401 || error.status === 403,
      isValidationError: error.status === 400,
      isNotFound: error.status === 404,
      isConflict: error.status === 409,
      isServerError: error.status >= 500,
    };
  }

  // Generic Error
  if (error instanceof Error) {
    return {
      message: error.message || "An unexpected error occurred",
      status: 0,
      fieldErrors: {},
      isNetworkError: false,
      isAuthError: false,
      isValidationError: false,
      isNotFound: false,
      isConflict: false,
      isServerError: false,
    };
  }

  // Unknown error
  return {
    message: "An unexpected error occurred",
    status: 0,
    fieldErrors: {},
    isNetworkError: false,
    isAuthError: false,
    isValidationError: false,
    isNotFound: false,
    isConflict: false,
    isServerError: false,
  };
}

// =============================================================================
// ERROR DISPLAY
// =============================================================================

/**
 * Show a toast message (Android) or alert (iOS).
 */
export function showToast(message: string, duration: "short" | "long" = "short"): void {
  if (Platform.OS === "android") {
    ToastAndroid.show(
      message,
      duration === "short" ? ToastAndroid.SHORT : ToastAndroid.LONG
    );
  } else {
    // iOS doesn't have native toast, use a simple alert
    Alert.alert("", message);
  }
}

/**
 * Show error toast from a ParsedApiError.
 * GO-LIVE-173: Enhanced to include error codes for debugging
 */
export function showErrorToast(error: ParsedApiError): void {
  let message = error.message;

  // Add more context for specific error types
  if (error.isNetworkError) {
    message = "Network error. Please check your connection.";
  } else if (error.isServerError) {
    // GO-LIVE-173: Include status code for server errors to help debugging
    message = `Server error (${error.status || 500}). Please try again later.`;
  } else if (error.isValidationError && error.code) {
    // GO-LIVE-173: Include validation error code
    message = `Validation error: ${error.message}`;
  } else if (error.isAuthError) {
    // GO-LIVE-173: Specific auth error messages
    message = error.code === 'device_unauthorized'
      ? "Device not authorized. Please re-enroll."
      : "Session expired. Please log in again.";
  }

  // GO-LIVE-173: Append error code if available (helps support diagnose issues)
  if (error.code && !message.includes(error.code)) {
    message = `${message} (${error.code})`;
  }

  showToast(message, "long");
}

/**
 * Show error toast from any error.
 */
export function showError(error: unknown): void {
  const parsed = parseError(error);
  showErrorToast(parsed);
}

// =============================================================================
// ERROR MESSAGES
// =============================================================================

/**
 * Get user-friendly message for common error codes.
 */
export function getErrorMessage(code: string | undefined): string | null {
  if (!code) return null;

  const messages: Record<string, string> = {
    VALIDATION_ERROR: "Please check your input and try again.",
    NOT_FOUND: "The requested item was not found.",
    UNAUTHORIZED: "Please log in to continue.",
    FORBIDDEN: "You don't have permission to do this.",
    CONFLICT: "This action conflicts with existing data.",
    RATE_LIMITED: "Too many requests. Please wait a moment.",
    INTERNAL_ERROR: "Something went wrong. Please try again.",
    device_unauthorized: "Device not authorized. Please re-enroll.",
    device_inactive: "This device has been deactivated.",
    device_not_enrolled: "Device not enrolled. Please enroll first.",
    store_inactive: "Store is currently inactive.",
  };

  return messages[code] ?? null;
}

/**
 * Get field-specific error message.
 */
export function getFieldError(
  error: ParsedApiError,
  field: string
): string | undefined {
  return error.fieldErrors[field];
}

// =============================================================================
// ERROR HANDLING UTILITIES
// =============================================================================

/**
 * Check if error requires re-authentication.
 */
export function requiresReauth(error: ParsedApiError): boolean {
  return (
    error.isAuthError ||
    error.code === "device_unauthorized" ||
    error.code === "UNAUTHORIZED" ||
    error.message === "device_unauthorized"
  );
}

/**
 * Check if error is a device block.
 */
export function isDeviceBlocked(error: ParsedApiError): boolean {
  return (
    error.code === "device_inactive" ||
    error.message === "device_inactive"
  );
}

/**
 * Check if error is retriable (network or server error).
 */
export function isRetriable(error: ParsedApiError): boolean {
  return error.isNetworkError || error.isServerError || error.status === 429;
}

// =============================================================================
// GL-CRIT-0087: RETRY UX
// =============================================================================

/**
 * GL-CRIT-0087: Show retry prompt for network errors
 * Returns a promise that resolves to true if user wants to retry, false otherwise
 */
export function showRetryPrompt(error: ParsedApiError): Promise<boolean> {
  return new Promise((resolve) => {
    const title = error.isNetworkError ? "Connection Error" : "Request Failed";
    const message = error.isNetworkError
      ? "Unable to connect to server. Please check your internet connection."
      : error.isServerError
      ? "Server is temporarily unavailable. Please try again."
      : error.message || "An error occurred.";

    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Retry", style: "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/**
 * GL-CRIT-0087: Execute function with automatic retry on network errors
 * @param fn - Function to execute
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param delayMs - Delay between retries in ms (default: 1000, doubles each retry)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; showPrompt?: boolean } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, showPrompt = false } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const parsed = parseError(error);

      // Only retry on retriable errors
      if (!isRetriable(parsed)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        throw error;
      }

      // Show prompt if requested, otherwise auto-retry
      if (showPrompt) {
        const shouldRetry = await showRetryPrompt(parsed);
        if (!shouldRetry) {
          throw error;
        }
      } else {
        // Auto-retry with exponential backoff
        const delay = delayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Log error for debugging (only in development).
 */
export function logError(context: string, error: unknown): void {
  if (__DEV__) {
    console.error(`[${context}]`, error);
    if (error instanceof ApiError) {
      console.error(`  Status: ${error.status}`);
      console.error(`  Payload:`, error.payload);
    }
  }
}

/**
 * GO-LIVE-173: Get diagnostic string for error (useful for support/debugging)
 * Returns a string that can be safely shown to users or logged
 */
export function getDiagnosticString(error: ParsedApiError): string {
  const parts: string[] = [];

  // Error type
  if (error.isNetworkError) parts.push("NetworkError");
  else if (error.isAuthError) parts.push("AuthError");
  else if (error.isValidationError) parts.push("ValidationError");
  else if (error.isServerError) parts.push("ServerError");
  else if (error.isNotFound) parts.push("NotFound");
  else if (error.isConflict) parts.push("Conflict");

  // Status code if present
  if (error.status > 0) parts.push(`HTTP${error.status}`);

  // Error code if present
  if (error.code) parts.push(error.code);

  // Request ID if present (helps support trace issues)
  if (error.requestId) parts.push(`Req:${error.requestId.slice(0, 8)}`);

  return parts.join("/") || "UnknownError";
}

/**
 * GO-LIVE-173: Get detailed error info for debugging
 * Should only be shown in development or error reports
 */
export function getDetailedErrorInfo(error: unknown): string {
  const parsed = parseError(error);
  const lines: string[] = [
    `Message: ${parsed.message}`,
    `Type: ${getDiagnosticString(parsed)}`,
  ];

  if (parsed.code) lines.push(`Code: ${parsed.code}`);
  if (parsed.status > 0) lines.push(`Status: ${parsed.status}`);
  if (parsed.requestId) lines.push(`Request ID: ${parsed.requestId}`);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    lines.push(`Field Errors: ${JSON.stringify(parsed.fieldErrors)}`);
  }

  return lines.join("\n");
}

export default {
  parseError,
  showToast,
  showError,
  showErrorToast,
  getErrorMessage,
  getFieldError,
  requiresReauth,
  isDeviceBlocked,
  isRetriable,
  showRetryPrompt,
  withRetry,
  logError,
  getDiagnosticString,
  getDetailedErrorInfo,
};
