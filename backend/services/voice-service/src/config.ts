// Voice Service Configuration - VOICE-003
// AUD-076-D: Migrated from OpenAI to Claude/Anthropic API
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
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('VOICE_SERVICE_PORT', 3009),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // AUD-076-D: Claude/Anthropic API configuration (replaces OpenAI)
  // ENV-FAILFAST-001: ANTHROPIC_API_KEY required in production
  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY', ''),
    model: getEnvOrDefault('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
    language: getEnvOrDefault('VOICE_LANGUAGE', 'hi'), // Hindi primary
  },

  // Legacy OpenAI config (deprecated - kept for backwards compatibility)
  openai: {
    apiKey: '', // AUD-076-D: Disabled - use anthropic.apiKey instead
    model: 'whisper-1',
    language: 'hi',
  },

  // Database configuration (uses shared pool from @supermandi/common)
  // ENV-FAILFAST-001: DB credentials required in production
  database: {
    host: requireEnv('DB_HOST', 'localhost'),
    port: getEnvIntOrDefault('DB_PORT', 5432),
    database: requireEnv('DB_NAME', 'supermandi'),
    user: requireEnv('DB_USER', 'postgres'),
    password: requireEnv('DB_PASSWORD', 'postgres'),
  },

  // Audio settings
  audio: {
    maxFileSizeMb: getEnvIntOrDefault('VOICE_MAX_FILE_SIZE_MB', 10),
    allowedMimeTypes: ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm'],
  },

  // Intent parsing settings
  intent: {
    // Confidence threshold for accepting intents
    minConfidence: 0.7,
  },
};

export type Config = typeof config;
