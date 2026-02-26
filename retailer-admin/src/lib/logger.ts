// Structured logger for retailer-admin
// In production: logs error/warn with tagged prefix, strips raw stack traces
// In development: passes through to console with full details
// REQ.AUDIT.W5.RETAILER.CONSOLE-ERROR-IN-PRODUCTION.001

const IS_PROD = import.meta.env.PROD;

function safeDetail(err: unknown): string {
  if (!IS_PROD) return '';
  if (err instanceof Error) return ` [${err.message}]`;
  if (typeof err === 'string') return ` [${err}]`;
  return ' [details hidden in production]';
}

export const logger = {
  error(msg: string, err?: unknown): void {
    if (IS_PROD) {
      console.error(`[RetailerAdmin] ${msg}${safeDetail(err)}`);
    } else {
      console.error(`[RetailerAdmin] ${msg}`, err);
    }
  },
  warn(msg: string, err?: unknown): void {
    if (IS_PROD) {
      console.warn(`[RetailerAdmin] ${msg}${safeDetail(err)}`);
    } else {
      console.warn(`[RetailerAdmin] ${msg}`, err);
    }
  },
  log(msg: string, ...args: unknown[]): void {
    if (!IS_PROD) {
      console.log(`[RetailerAdmin] ${msg}`, ...args);
    }
  },
};
