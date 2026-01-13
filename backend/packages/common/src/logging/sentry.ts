// Sentry Integration - V3.0.9 compliant
// Error tracking and performance monitoring

import * as Sentry from '@sentry/node';
import { ErrorRequestHandler, RequestHandler } from 'express';

// =============================================================================
// TYPES
// =============================================================================

export interface SentryConfig {
  dsn?: string;
  environment?: string;
  release?: string;
  service?: string;
  sampleRate?: number;
  tracesSampleRate?: number;
  enabled?: boolean;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

let isInitialized = false;

function parseSampleRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Initialize Sentry for error tracking.
 */
export function initSentry(config: SentryConfig): void {
  const dsn = config.dsn || process.env.SENTRY_DSN;
  const environment =
    config.environment ||
    process.env.SENTRY_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development';
  const release =
    config.release || process.env.SENTRY_RELEASE || process.env.RELEASE_VERSION;
  const sampleRate =
    config.sampleRate ?? parseSampleRate(process.env.SENTRY_SAMPLE_RATE, 1.0);
  const tracesSampleRate =
    config.tracesSampleRate ??
    parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1);
  const serverName = config.service || process.env.SERVICE_NAME;

  if (!dsn) {
    console.warn('[Sentry] No DSN provided, error tracking disabled');
    return;
  }

  if (config.enabled === false) {
    console.info('[Sentry] Explicitly disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release,
    serverName,
    sampleRate,
    tracesSampleRate,
    integrations: [
      // Capture unhandled promise rejections
      Sentry.captureConsoleIntegration({ levels: ['error'] }),
    ],
    beforeSend(event, hint) {
      // Filter out expected errors
      const error = hint.originalException;
      if (error instanceof Error) {
        // Skip 4xx client errors
        if ('status' in error && typeof error.status === 'number') {
          if (error.status >= 400 && error.status < 500) {
            return null;
          }
        }
      }
      return event;
    },
  });

  isInitialized = true;
  console.info('[Sentry] Initialized successfully');
}

/**
 * Check if Sentry is initialized.
 */
export function isSentryInitialized(): boolean {
  return isInitialized;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Sentry request handler middleware.
 * Should be added at the beginning of the middleware chain.
 */
export function sentryRequestHandler(): RequestHandler {
  if (!isInitialized) {
    return (_req, _res, next) => next();
  }

  return Sentry.Handlers.requestHandler({
    include: {
      ip: true,
      user: true,
      request: ['headers', 'method', 'url', 'query_string'],
    },
  });
}

/**
 * Sentry tracing handler for performance monitoring.
 */
export function sentryTracingHandler(): RequestHandler {
  if (!isInitialized) {
    return (_req, _res, next) => next();
  }

  return Sentry.Handlers.tracingHandler();
}

/**
 * Sentry error handler middleware.
 * Should be added after all routes but before other error handlers.
 */
export function sentryErrorHandler(): ErrorRequestHandler {
  if (!isInitialized) {
    return (err, _req, _res, next) => next(err);
  }

  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Only report 5xx errors to Sentry
      if ('status' in error && typeof error.status === 'number') {
        return error.status >= 500;
      }
      return true;
    },
  });
}

// =============================================================================
// CAPTURE FUNCTIONS
// =============================================================================

/**
 * Capture an exception to Sentry.
 */
export function captureException(
  error: Error,
  context?: {
    correlationId?: string;
    userId?: string;
    storeId?: string;
    extra?: Record<string, unknown>;
    tags?: Record<string, string>;
  }
): string | undefined {
  if (!isInitialized) {
    console.error('[Sentry] Not initialized, error not captured:', error.message);
    return undefined;
  }

  return Sentry.captureException(error, {
    tags: {
      correlationId: context?.correlationId,
      ...context?.tags,
    },
    user: context?.userId ? { id: context.userId } : undefined,
    extra: {
      storeId: context?.storeId,
      ...context?.extra,
    },
  });
}

/**
 * Capture a message to Sentry.
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>
): string | undefined {
  if (!isInitialized) {
    return undefined;
  }

  return Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Add breadcrumb for debugging context.
 */
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message?: string;
  level?: Sentry.SeverityLevel;
  data?: Record<string, unknown>;
}): void {
  if (!isInitialized) return;

  Sentry.addBreadcrumb({
    category: breadcrumb.category || 'custom',
    message: breadcrumb.message,
    level: breadcrumb.level || 'info',
    data: breadcrumb.data,
  });
}

/**
 * Set user context for Sentry.
 */
export function setUser(user: {
  id?: string;
  email?: string;
  username?: string;
  ip?: string;
} | null): void {
  if (!isInitialized) return;

  Sentry.setUser(user);
}

/**
 * Set additional context (tags).
 */
export function setTag(key: string, value: string): void {
  if (!isInitialized) return;

  Sentry.setTag(key, value);
}

/**
 * Set extra context data.
 */
export function setExtra(key: string, value: unknown): void {
  if (!isInitialized) return;

  Sentry.setExtra(key, value);
}

// =============================================================================
// SCOPES AND TRANSACTIONS
// =============================================================================

/**
 * Run a function within a Sentry scope with custom context.
 */
export async function withScope<T>(
  context: {
    correlationId?: string;
    userId?: string;
    storeId?: string;
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  },
  callback: () => T | Promise<T>
): Promise<T> {
  if (!isInitialized) {
    return callback();
  }

  return Sentry.withScope(async (scope) => {
    if (context.correlationId) {
      scope.setTag('correlationId', context.correlationId);
    }
    if (context.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context.storeId) {
      scope.setTag('storeId', context.storeId);
    }
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    return callback();
  });
}

/**
 * Flush Sentry queue (useful before process exit).
 */
export async function flush(timeout: number = 2000): Promise<boolean> {
  if (!isInitialized) return true;

  return Sentry.flush(timeout);
}

/**
 * Close Sentry client.
 */
export async function close(timeout: number = 2000): Promise<boolean> {
  if (!isInitialized) return true;

  return Sentry.close(timeout);
}

export default {
  initSentry,
  isSentryInitialized,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  setTag,
  setExtra,
  withScope,
  flush,
  close,
};
