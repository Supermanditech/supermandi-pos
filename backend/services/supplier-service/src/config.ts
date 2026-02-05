// Supplier Service Configuration - V3.0.9 compliant
// ENV-FAILFAST-001: Crash in production if required env vars are missing

const IS_PROD = process.env['NODE_ENV'] === 'production';

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvIntOrDefault(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/** ENV-FAILFAST-001: Require env var in production; use dev default otherwise */
function requireEnv(key: string, devDefault: string): string {
  const value = process.env[key];
  if (value) return value;
  if (IS_PROD) {
    console.error(`[config] FATAL: ${key} is required in production but not set`);
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
  // ENV-FAILFAST-001: JWT_SECRET is CRITICAL — must not use dev default in production
  jwtSecret: requireEnv('JWT_SECRET', 'dev-secret-change-in-prod'),

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
