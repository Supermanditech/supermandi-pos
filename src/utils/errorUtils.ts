// Production-grade error message extraction for POS app
// Usage: catch (_error: unknown) { const error = asError(_error); ... error.message ... }

export interface CaughtError extends Error {
  code?: string;
  name: string;
}

/**
 * Safely extract a typed error from unknown catch variable.
 */
export function asError(e: unknown): CaughtError {
  if (e instanceof Error) {
    return e as CaughtError;
  }
  return Object.assign(new Error(String(e)), { originalValue: e }) as CaughtError;
}

/** Extract error message from unknown */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
