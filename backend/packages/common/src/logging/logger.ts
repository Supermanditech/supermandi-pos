// Logger - V3.0.9 compliant
// Structured logging with pino and correlation ID support

import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

// =============================================================================
// TYPES
// =============================================================================

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  storeId?: string;
  service?: string;
  [key: string]: unknown;
}

export interface LoggerConfig {
  service: string;
  level?: string;
  prettyPrint?: boolean;
  sentryDsn?: string;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// =============================================================================
// LOGGER CLASS
// =============================================================================

export class Logger {
  private pino: PinoLogger;
  private context: LogContext;
  private service: string;

  constructor(config: LoggerConfig, context: LogContext = {}) {
    this.service = config.service;
    this.context = { service: config.service, ...context };

    const options: LoggerOptions = {
      level: config.level || process.env.LOG_LEVEL || 'info',
      base: {
        service: config.service,
        pid: process.pid,
        hostname: process.env.HOSTNAME || 'unknown',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
          pid: bindings.pid,
          hostname: bindings.hostname,
          service: bindings.service,
        }),
      },
      // Redact sensitive fields
      redact: {
        paths: [
          'password',
          'pin',
          'token',
          'authorization',
          'cookie',
          'secret',
          '*.password',
          '*.pin',
          '*.token',
          '*.authorization',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
    };

    // Pretty print for development
    if (config.prettyPrint || process.env.NODE_ENV === 'development') {
      this.pino = pino({
        ...options,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      });
    } else {
      this.pino = pino(options);
    }
  }

  /**
   * Create a child logger with additional context.
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger(
      { service: this.service, level: this.pino.level },
      { ...this.context, ...context }
    );
    childLogger.pino = this.pino.child(context);
    return childLogger;
  }

  /**
   * Add context to all subsequent logs.
   */
  withContext(context: LogContext): Logger {
    return this.child(context);
  }

  /**
   * Add correlation ID to logger context.
   */
  withCorrelationId(correlationId: string): Logger {
    return this.child({ correlationId });
  }

  /**
   * Add request ID to logger context.
   */
  withRequestId(requestId: string): Logger {
    return this.child({ requestId });
  }

  // ---------------------------------------------------------------------------
  // LOG METHODS
  // ---------------------------------------------------------------------------

  trace(msg: string, data?: object): void {
    this.pino.trace({ ...this.context, ...data }, msg);
  }

  debug(msg: string, data?: object): void {
    this.pino.debug({ ...this.context, ...data }, msg);
  }

  info(msg: string, data?: object): void {
    this.pino.info({ ...this.context, ...data }, msg);
  }

  warn(msg: string, data?: object): void {
    this.pino.warn({ ...this.context, ...data }, msg);
  }

  error(msg: string, error?: Error | object, data?: object): void {
    if (error instanceof Error) {
      this.pino.error(
        {
          ...this.context,
          ...data,
          err: {
            message: error.message,
            name: error.name,
            stack: error.stack,
          },
        },
        msg
      );
    } else {
      this.pino.error({ ...this.context, ...error, ...data }, msg);
    }
  }

  fatal(msg: string, error?: Error | object, data?: object): void {
    if (error instanceof Error) {
      this.pino.fatal(
        {
          ...this.context,
          ...data,
          err: {
            message: error.message,
            name: error.name,
            stack: error.stack,
          },
        },
        msg
      );
    } else {
      this.pino.fatal({ ...this.context, ...error, ...data }, msg);
    }
  }

  // ---------------------------------------------------------------------------
  // SPECIALIZED LOG METHODS
  // ---------------------------------------------------------------------------

  /**
   * Log HTTP request start.
   */
  logRequest(req: {
    method: string;
    url: string;
    headers?: Record<string, unknown>;
    body?: unknown;
  }): void {
    this.info('HTTP request received', {
      http: {
        method: req.method,
        url: req.url,
        userAgent: req.headers?.['user-agent'],
      },
    });
  }

  /**
   * Log HTTP response.
   */
  logResponse(res: {
    method: string;
    url: string;
    statusCode: number;
    durationMs: number;
  }): void {
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    this[level]('HTTP response sent', {
      http: {
        method: res.method,
        url: res.url,
        statusCode: res.statusCode,
        durationMs: res.durationMs,
      },
    });
  }

  /**
   * Log database query.
   */
  logQuery(query: string, durationMs: number, error?: Error): void {
    if (error) {
      this.error('Database query failed', error, {
        db: { query: this.truncate(query, 500), durationMs },
      });
    } else {
      this.debug('Database query executed', {
        db: { query: this.truncate(query, 200), durationMs },
      });
    }
  }

  /**
   * Log event processing.
   */
  logEvent(eventType: string, data?: object): void {
    this.info(`Event: ${eventType}`, { event: { type: eventType, ...data } });
  }

  /**
   * Log business operation.
   */
  logOperation(operation: string, data?: object): void {
    this.info(`Operation: ${operation}`, { operation, ...data });
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }

  /**
   * Get the underlying pino logger (for advanced use).
   */
  getPino(): PinoLogger {
    return this.pino;
  }

  /**
   * Flush logs (useful before process exit).
   */
  flush(): void {
    this.pino.flush();
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

let defaultLogger: Logger | null = null;

/**
 * Create a new logger instance.
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Get or create the default logger.
 */
export function getLogger(service?: string): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger({
      service: service || process.env.SERVICE_NAME || 'supermandi',
    });
  }
  return defaultLogger;
}

/**
 * Set the default logger.
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

export default Logger;
