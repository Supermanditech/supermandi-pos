// Voice Service Configuration - VOICE-003

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
  port: getEnvIntOrDefault('VOICE_SERVICE_PORT', 3008),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // OpenAI configuration
  openai: {
    apiKey: getEnvOrDefault('OPENAI_API_KEY', ''),
    model: getEnvOrDefault('OPENAI_STT_MODEL', 'whisper-1'),
    language: getEnvOrDefault('OPENAI_STT_LANGUAGE', 'hi'), // Hindi primary
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
