// useApiError Hook - V3.0.9 compliant
// React hook for handling API errors with toast display and navigation

import { useState, useCallback, useRef } from "react";
import { useNavigation, CommonActions } from "@react-navigation/native";

import {
  parseError,
  showToast,
  requiresReauth,
  isDeviceBlocked,
  logError,
  type ParsedApiError,
} from "../utils/errorHandler";
import { clearDeviceSession } from "../services/deviceSession";

// =============================================================================
// TYPES
// =============================================================================

export interface UseApiErrorOptions {
  /**
   * Context name for logging (e.g., component name)
   */
  context?: string;
  /**
   * Auto-show toast on error
   */
  showToastOnError?: boolean;
  /**
   * Auto-navigate on auth errors
   */
  navigateOnAuthError?: boolean;
  /**
   * Callback when auth error occurs (before navigation)
   */
  onAuthError?: (error: ParsedApiError) => void;
  /**
   * Callback when any error occurs
   */
  onError?: (error: ParsedApiError) => void;
}

export interface UseApiErrorReturn {
  /**
   * Current error (null if no error)
   */
  error: ParsedApiError | null;
  /**
   * Set error from any error type
   */
  setError: (error: unknown) => ParsedApiError;
  /**
   * Clear current error
   */
  clearError: () => void;
  /**
   * Handle error (parse, log, toast, navigate)
   */
  handleError: (error: unknown) => ParsedApiError;
  /**
   * Get field-specific error message
   */
  getFieldError: (field: string) => string | undefined;
  /**
   * Check if field has error
   */
  hasFieldError: (field: string) => boolean;
  /**
   * Check if there's any error
   */
  hasError: boolean;
  /**
   * Whether error is loading/processing
   */
  isProcessing: boolean;
  /**
   * Set processing state
   */
  setProcessing: (processing: boolean) => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useApiError(options: UseApiErrorOptions = {}): UseApiErrorReturn {
  const {
    context = "Unknown",
    showToastOnError = true,
    navigateOnAuthError = true,
    onAuthError,
    onError,
  } = options;

  const navigation = useNavigation();
  const [error, setErrorState] = useState<ParsedApiError | null>(null);
  const [isProcessing, setProcessing] = useState(false);
  const handlingAuthRef = useRef(false);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const handleAuthError = useCallback(
    async (parsedError: ParsedApiError) => {
      // Prevent multiple auth error handlers
      if (handlingAuthRef.current) return;
      handlingAuthRef.current = true;

      try {
        onAuthError?.(parsedError);

        if (navigateOnAuthError) {
          // Check if device is blocked
          if (isDeviceBlocked(parsedError)) {
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: "DeviceBlocked" }],
              })
            );
            return;
          }

          // Check if re-enrollment needed
          if (requiresReauth(parsedError)) {
            await clearDeviceSession();
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: "EnrollDevice" }],
              })
            );
          }
        }
      } finally {
        handlingAuthRef.current = false;
      }
    },
    [navigateOnAuthError, navigation, onAuthError]
  );

  const handleError = useCallback(
    (rawError: unknown): ParsedApiError => {
      const parsedError = parseError(rawError);

      // Log error in development
      logError(context, rawError);

      // Set error state
      setErrorState(parsedError);

      // Callback
      onError?.(parsedError);

      // Show toast
      if (showToastOnError && !parsedError.isAuthError) {
        showToast(parsedError.message, "long");
      }

      // Handle auth errors with navigation
      if (parsedError.isAuthError) {
        void handleAuthError(parsedError);
      }

      return parsedError;
    },
    [context, handleAuthError, onError, showToastOnError]
  );

  const setError = useCallback(
    (rawError: unknown): ParsedApiError => {
      return handleError(rawError);
    },
    [handleError]
  );

  const getFieldError = useCallback(
    (field: string): string | undefined => {
      return error?.fieldErrors[field];
    },
    [error]
  );

  const hasFieldError = useCallback(
    (field: string): boolean => {
      return Boolean(error?.fieldErrors[field]);
    },
    [error]
  );

  return {
    error,
    setError,
    clearError,
    handleError,
    getFieldError,
    hasFieldError,
    hasError: error !== null,
    isProcessing,
    setProcessing,
  };
}

// =============================================================================
// ASYNC WRAPPER
// =============================================================================

/**
 * Wrap an async function with error handling.
 * Returns [result, error] tuple.
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  onError?: (error: ParsedApiError) => void
): Promise<[T | null, ParsedApiError | null]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    const parsed = parseError(error);
    onError?.(parsed);
    return [null, parsed];
  }
}

/**
 * Create a wrapped async function that handles errors.
 */
export function createErrorHandler(context: string) {
  return {
    wrap: async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (error) {
        logError(context, error);
        const parsed = parseError(error);
        showToast(parsed.message, "long");
        return null;
      }
    },
    wrapSilent: async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (error) {
        logError(context, error);
        return null;
      }
    },
  };
}

export default useApiError;
