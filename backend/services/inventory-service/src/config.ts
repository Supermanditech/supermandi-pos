// Inventory Service Configuration - V3.0.9 compliant

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvIntOrDefault(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config = {
  // Service configuration
  // GO-LIVE-FIX: Changed default from 3005 to 3004 to match .env
  // CR-HEALTH-001: Cloud Run sets PORT; fall back to service-specific var
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('INVENTORY_SERVICE_PORT', 3004),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // Database configuration (uses shared pool from @supermandi/common)
  database: {
    host: getEnvOrDefault('DB_HOST', 'localhost'),
    port: getEnvIntOrDefault('DB_PORT', 5432),
    database: getEnvOrDefault('DB_NAME', 'supermandi'),
    user: getEnvOrDefault('DB_USER', 'postgres'),
    password: getEnvOrDefault('DB_PASSWORD', 'postgres'),
  },
};

export type Config = typeof config;
