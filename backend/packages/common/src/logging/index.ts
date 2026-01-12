// Logging Module - V3.0.9 compliant
// Structured logging, request tracking, error monitoring, and health checks

// Logger
export {
  Logger,
  LogContext,
  LoggerConfig,
  LogLevel,
  createLogger,
  getLogger,
  setDefaultLogger,
} from './logger';

// Request Logger Middleware
export {
  RequestLoggerOptions,
  requestLogger,
  correlationId,
  getCorrelationId,
  getRequestId,
} from './requestLogger';

// Sentry Integration
export {
  SentryConfig,
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
  flush as flushSentry,
  close as closeSentry,
} from './sentry';

// Health Checks
export {
  HealthStatus,
  HealthCheck,
  HealthConfig,
  HealthCheckConfig,
  HealthChecker,
  createHealthChecker,
  createHealthRouter,
} from './health';
