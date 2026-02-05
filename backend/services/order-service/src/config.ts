// Order Service Configuration - V3.0.9 compliant

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
  // CR-HEALTH-001: Cloud Run sets PORT; fall back to service-specific var
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('ORDER_SERVICE_PORT', 3005),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // Database configuration (uses shared pool from @supermandi/common)
  database: {
    host: getEnvOrDefault('DB_HOST', 'localhost'),
    port: getEnvIntOrDefault('DB_PORT', 5432),
    database: getEnvOrDefault('DB_NAME', 'supermandi'),
    user: getEnvOrDefault('DB_USER', 'postgres'),
    password: getEnvOrDefault('DB_PASSWORD', 'postgres'),
  },

  // Internal service URLs
  // CR-SVCURL-001: Fixed port bug (3005→3004), added production fail-fast
  services: {
    inventoryService: (() => {
      const url = process.env['INVENTORY_SERVICE_URL'];
      if (url) return url;
      if (process.env['NODE_ENV'] === 'production') {
        console.error('[config] FATAL: INVENTORY_SERVICE_URL is required in production but not set');
        process.exit(1);
      }
      return 'http://localhost:3004';
    })(),
  },
};

export type Config = typeof config;
