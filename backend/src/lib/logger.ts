// LOG-001: Lightweight structured logger wrapper (~50 lines, no new deps)
// When LOG_FORMAT=json, outputs JSON lines for Cloud Logging.
// Otherwise, uses standard console output for dev readability.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
const useJson = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= (LEVEL_PRIORITY[minLevel] ?? 1);
}

function formatMessage(level: LogLevel, msg: string, meta?: Record<string, unknown>): string {
  if (useJson) {
    return JSON.stringify({
      severity: level.toUpperCase(),
      message: msg,
      timestamp: new Date().toISOString(),
      service: process.env.SERVICE_NAME || 'main-backend',
      ...meta,
    });
  }
  const prefix = `[${level.toUpperCase()}]`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${prefix} ${msg}${metaStr}`;
}

export const logger = {
  debug(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog('debug')) console.debug(formatMessage('debug', msg, meta));
  },
  info(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog('info')) console.log(formatMessage('info', msg, meta));
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', msg, meta));
  },
  error(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog('error')) console.error(formatMessage('error', msg, meta));
  },
};
