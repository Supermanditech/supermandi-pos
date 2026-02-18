// T-210: Structured logger with correlation ID + child logger support
// Outputs JSON lines for Cloud Logging in production.
// Standard console output in development for readability.
// Usage: import { logger } from '../lib/logger';
//        const reqLog = logger.child({ correlationId: req.headers['x-request-id'], storeId });

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
const useJson = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';
const serviceName = process.env.SERVICE_NAME || 'main-backend';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= (LEVEL_PRIORITY[minLevel] ?? 1);
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  if (useJson) {
    const line = JSON.stringify({
      severity: level.toUpperCase(),
      message: msg,
      timestamp: new Date().toISOString(),
      service: serviceName,
      ...meta,
    });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  } else {
    const prefix = `[${level.toUpperCase()}]`;
    const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    const line = `${prefix} ${msg}${metaStr}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else if (level === 'debug') console.debug(line);
    else console.log(line);
  }
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

function createChild(context: Record<string, unknown>): Logger {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, { ...context, ...meta }),
    info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, { ...context, ...meta }),
    warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, { ...context, ...meta }),
    error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, { ...context, ...meta }),
    child: (extra: Record<string, unknown>) => createChild({ ...context, ...extra }),
  };
}

export const logger: Logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
  child: createChild,
};

/** Console-compatible variadic wrapper — drop-in replacement for console.log/error/warn */
function joinArgs(args: unknown[]): string {
  return args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
}

export const log = {
  info: (...args: unknown[]) => logger.info(joinArgs(args)),
  error: (...args: unknown[]) => logger.error(joinArgs(args)),
  warn: (...args: unknown[]) => logger.warn(joinArgs(args)),
  debug: (...args: unknown[]) => logger.debug(joinArgs(args)),
};
