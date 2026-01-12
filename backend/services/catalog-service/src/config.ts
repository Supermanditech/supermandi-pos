// Catalog Service Configuration - V3.0.9 compliant

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
  port: getEnvIntOrDefault('CATALOG_SERVICE_PORT', 3003),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // Database configuration (uses shared pool from @supermandi/common)
  database: {
    host: getEnvOrDefault('DB_HOST', 'localhost'),
    port: getEnvIntOrDefault('DB_PORT', 5432),
    database: getEnvOrDefault('DB_NAME', 'supermandi'),
    user: getEnvOrDefault('DB_USER', 'postgres'),
    password: getEnvOrDefault('DB_PASSWORD', 'postgres'),
  },

  // Redis configuration
  redis: {
    host: getEnvOrDefault('REDIS_HOST', 'localhost'),
    port: getEnvIntOrDefault('REDIS_PORT', 6379),
    password: getEnvOrDefault('REDIS_PASSWORD', ''),
    db: getEnvIntOrDefault('REDIS_DB', 0),
  },

  // Cache settings
  cache: {
    // Default TTL in seconds (5 minutes)
    defaultTtl: getEnvIntOrDefault('CACHE_DEFAULT_TTL', 300),
    // Search results TTL (2 minutes for fresher results)
    searchTtl: getEnvIntOrDefault('CACHE_SEARCH_TTL', 120),
    // Catalog TTL (5 minutes)
    catalogTtl: getEnvIntOrDefault('CACHE_CATALOG_TTL', 300),
  },

  // Search settings
  search: {
    // Minimum trigram similarity threshold (0.0 - 1.0)
    minSimilarity: 0.3,
    // Default result limit
    defaultLimit: 50,
    // Maximum result limit
    maxLimit: 200,
  },
};

export type Config = typeof config;
