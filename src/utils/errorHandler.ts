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
 */
export function showErrorToast(error: ParsedApiError): void {
  let message = error.message;

  // Add more context for specific error types
  if (error.isNetworkError) {
    message = "Network error. Please check your connection.";
  } else if (error.isServerError) {
    message = "Server error. Please try again later.";
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
  logError,
};
