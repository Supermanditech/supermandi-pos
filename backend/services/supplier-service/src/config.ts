// Supplier Service Configuration - V3.0.9 compliant
// ENV-FAILFAST-001: Crash in production if required env vars are missing

import { createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'supplier-service', level: process.env.LOG_LEVEL || 'info' });

// SEC-003: Only allow dev defaults when NODE_ENV is explicitly 'development' or 'test'
const _env = (process.env['NODE_ENV'] || '').toLowerCase();
const IS_DEV = _env === 'development' || _env === 'test';

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvIntOrDefault(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/** SEC-003: Require env var unless explicitly in development/test */
function requireEnv(key: string, devDefault: string): string {
  const value = process.env[key];
  if (value) return value;
  if (!IS_DEV) {
    logger.error(`[config] FATAL: ${key} is required (NODE_ENV is not development/test)`);
    process.exit(1);
  }
  return devDefault;
}

export const config = {
  // Service configuration
  // CR-HEALTH-001: Cloud Run sets PORT; fall back to service-specific var
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('SUPPLIER_SERVICE_PORT', 3002),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // JWT configuration for supplier auth (SM-005)
  // W5-BACKEND-JWT-001: JWT_SECRET has no dev fallback — must be explicitly set in all environments
  jwtSecret: (() => {
    const s = process.env['JWT_SECRET'];
    if (!s) { logger.error('[config] FATAL: JWT_SECRET is required in all environments'); process.exit(1); }
    return s;
  })(),

  // Database configuration (uses shared pool from @supermandi/common)
  // ENV-FAILFAST-001: DB credentials required in production
  database: {
    host: requireEnv('DB_HOST', 'localhost'),
    port: getEnvIntOrDefault('DB_PORT', 5432),
    database: requireEnv('DB_NAME', 'supermandi'),
    user: requireEnv('DB_USER', 'postgres'),
    password: requireEnv('DB_PASSWORD', 'postgres'),
  },
};

export type Config = typeof config;
