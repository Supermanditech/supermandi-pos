// Production-grade error extraction from unknown catch variables
// Usage: catch (_error: unknown) { const error = asError(_error); ... error.message, error.code ... }

/** Typed shape of caught errors — includes PostgreSQL (string) and gRPC (number) error codes */
export interface CaughtError extends Error {
  code?: string | number;
  detail?: string;
  constraint?: string;
  severity?: string;
  isTimeout?: boolean;
  isUnavailable?: boolean;
}

/**
 * Safely extract a typed error from unknown catch variable.
 * Preserves PostgreSQL error properties (.code, .detail, .constraint).
 */
export function asError(e: unknown): CaughtError {
  if (e instanceof Error) {
    return e as CaughtError;
  }
  return Object.assign(new Error(String(e)), { originalValue: e }) as CaughtError;
}
