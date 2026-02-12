// GL-CRIT-0055: Sanitize error messages to prevent information disclosure

// Known safe error patterns that can be shown to users
const SAFE_ERROR_PATTERNS = [
  /^admin disabled/i,
  /^unauthorized/i,
  /^not found$/i,
  /^invalid.*token/i,
  /^store.*not found/i,
  /^device.*not found/i,
  /^user.*not found/i,
  /^validation.*failed/i,
  /^required.*missing/i,
  /^invalid.*format/i,
  /^rate limit/i,
  /^permission denied/i,
  /^access denied/i,
  /^already exists/i,
  /^duplicate/i,
];

// Patterns that indicate sensitive information that must be hidden
const SENSITIVE_PATTERNS = [
  /sql/i,
  /postgres/i,
  /redis/i,
  /column/i,
  /table/i,
  /constraint/i,
  /relation/i,
  /at\s+\//i, // Stack traces with paths
  /\/[a-z]+\/[a-z]+/i, // File paths
  /node_modules/i,
  /internal server/i,
  /econnrefused/i,
  /etimedout/i,
  /enotfound/i,
  /connection.*refused/i,
  /jwt.*secret/i,
  /password/i,
  /secret/i,
  /token.*invalid.*signature/i,
];

/**
 * Sanitize an error message to prevent information disclosure.
 * Returns a user-friendly message that doesn't expose implementation details.
 */
export function sanitizeErrorMessage(rawError: string | undefined | null, fallback: string): string {
  if (!rawError) {
    return fallback;
  }

  const errorStr = String(rawError).trim();

  // Empty or very short errors get fallback
  if (errorStr.length < 3) {
    return fallback;
  }

  // Check if error contains sensitive information
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(errorStr)) {
      // AUDIT-SA-032: Only log in dev — browser console.warn leaks filtered content
      if (import.meta.env.DEV) {
        console.warn("[GL-CRIT-0055] Sensitive error filtered:", errorStr.substring(0, 100));
      }
      return fallback;
    }
  }

  // Check if error matches known safe patterns
  for (const pattern of SAFE_ERROR_PATTERNS) {
    if (pattern.test(errorStr)) {
      return errorStr;
    }
  }

  // For HTTP status codes, allow simple messages
  if (/^(request|operation)\s+failed\s*\(\d+\)$/i.test(errorStr)) {
    return errorStr;
  }

  // If error is very long (>200 chars), it likely contains sensitive info
  if (errorStr.length > 200) {
    // AUDIT-SA-032: Only log in dev — browser console.warn leaks filtered content
    if (import.meta.env.DEV) {
      console.warn("[GL-CRIT-0055] Long error filtered:", errorStr.substring(0, 100));
    }
    return fallback;
  }

  // For other errors, check if they look like user-friendly messages
  // (no special characters, reasonable length, proper capitalization)
  if (/^[A-Z][a-zA-Z0-9\s.,!?'-]{5,150}$/.test(errorStr)) {
    return errorStr;
  }

  // Default: return the error but truncate and clean it
  const cleaned = errorStr
    .replace(/[\r\n\t]+/g, " ") // Remove newlines/tabs
    .replace(/\s+/g, " ") // Normalize spaces
    .substring(0, 100); // Truncate

  return cleaned || fallback;
}
