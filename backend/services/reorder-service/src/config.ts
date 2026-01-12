// Reorder Service Configuration - V3.0.9 compliant

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
  port: getEnvIntOrDefault('REORDER_SERVICE_PORT', 3006),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // Database configuration (uses shared pool from @supermandi/common)
  database: {
    host: getEnvOrDefault('DB_HOST', 'localhost'),
    port: getEnvIntOrDefault('DB_PORT', 5432),
    database: getEnvOrDefault('DB_NAME', 'supermandi'),
    user: getEnvOrDefault('DB_USER', 'postgres'),
    password: getEnvOrDefault('DB_PASSWORD', 'postgres'),
  },

  // Redis configuration (for event queues)
  redis: {
    host: getEnvOrDefault('REDIS_HOST', 'localhost'),
    port: getEnvIntOrDefault('REDIS_PORT', 6379),
    password: getEnvOrDefault('REDIS_PASSWORD', ''),
    db: getEnvIntOrDefault('REDIS_DB', 0),
  },

  // Reorder settings
  reorder: {
    // Default expiry for pending reorders (hours)
    pendingExpiryHours: getEnvIntOrDefault('REORDER_PENDING_EXPIRY_HOURS', 72),
    // Default limit for list queries
    defaultLimit: getEnvIntOrDefault('REORDER_DEFAULT_LIMIT', 50),
    // Maximum limit for list queries
    maxLimit: getEnvIntOrDefault('REORDER_MAX_LIMIT', 200),
  },
};

export type Config = typeof config;
