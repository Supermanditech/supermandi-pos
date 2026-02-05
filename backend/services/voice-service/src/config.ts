// Voice Service Configuration - VOICE-003
// AUD-076-D: Migrated from OpenAI to Claude/Anthropic API

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
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('VOICE_SERVICE_PORT', 3009),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // AUD-076-D: Claude/Anthropic API configuration (replaces OpenAI)
  anthropic: {
    apiKey: getEnvOrDefault('ANTHROPIC_API_KEY', ''),
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
  database: {
    host: getEnvOrDefault('DB_HOST', 'localhost'),
    port: getEnvIntOrDefault('DB_PORT', 5432),
    database: getEnvOrDefault('DB_NAME', 'supermandi'),
    user: getEnvOrDefault('DB_USER', 'postgres'),
    password: getEnvOrDefault('DB_PASSWORD', 'postgres'),
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
