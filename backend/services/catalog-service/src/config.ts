// Catalog Service Configuration - V3.0.9 compliant
// ENV-FAILFAST-001: Crash in production if required env vars are missing

import { createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'catalog-service', level: process.env.LOG_LEVEL || 'info' });

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
    logger.error(`[config] FATAL: ${key} is required in production but not set`);
    process.exit(1);
  }
  return devDefault;
}

export const config = {
  // Service configuration
  // CR-HEALTH-001: Cloud Run sets PORT; fall back to service-specific var
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('CATALOG_SERVICE_PORT', 3003),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // Database configuration (uses shared pool from @supermandi/common)
  // ENV-FAILFAST-001: DB credentials required in production
  database: {
    host: requireEnv('DB_HOST', 'localhost'),
    port: getEnvIntOrDefault('DB_PORT', 5432),
    database: requireEnv('DB_NAME', 'supermandi'),
    user: requireEnv('DB_USER', 'postgres'),
    password: requireEnv('DB_PASSWORD', 'postgres'),
  },

  // Redis configuration
  // ENV-FAILFAST-001: Redis host required in production
  redis: {
    host: requireEnv('REDIS_HOST', 'localhost'),
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
