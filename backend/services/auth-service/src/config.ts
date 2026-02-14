// Auth Service Configuration - V3.0.9 compliant

export interface AuthServiceConfig {
  port: number;
  env: string;
  bcryptRounds: number;
  passwordMinLength: number;
  jwt: {
    secret: string;
    accessTokenExpiresIn: string;
    refreshTokenExpiresInDays: number;
    issuer: string;
  };
  // AUTH-IDLE-001: Server-side idle timeout
  idleTimeoutMinutes: number;
  // AUTH-CONCURRENT-001: Maximum concurrent sessions per user
  maxConcurrentSessions: number;
  firebase: {
    serviceAccountPath?: string;
    projectId?: string;
    enabled: boolean;
  };
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvIntOrDefault(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'
function getEnvRequired(key: string): string {
  const value = process.env[key];
  if (!value) {
    const env = (process.env.NODE_ENV || '').toLowerCase();
    if (key === 'JWT_SECRET' && (env === 'development' || env === 'test')) {
      return 'dev-secret-change-in-prod';
    }
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

export const config: AuthServiceConfig = {
  // CR-HEALTH-001: Cloud Run sets PORT; fall back to service-specific var
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('AUTH_SERVICE_PORT', 3001),
  env: getEnvOrDefault('NODE_ENV', 'development'),
  bcryptRounds: getEnvIntOrDefault('BCRYPT_ROUNDS', 12),
  passwordMinLength: getEnvIntOrDefault('PASSWORD_MIN_LENGTH', 8),
  jwt: {
    secret: getEnvRequired('JWT_SECRET'),
    accessTokenExpiresIn: getEnvOrDefault('JWT_ACCESS_TOKEN_EXPIRES_IN', '15m'),
    refreshTokenExpiresInDays: getEnvIntOrDefault('JWT_REFRESH_TOKEN_EXPIRES_DAYS', 7),
    issuer: getEnvOrDefault('JWT_ISSUER', 'supermandi-auth'),
  },
  // AUTH-IDLE-001: Server-side idle timeout (default 35 min, slightly > client 30 min)
  idleTimeoutMinutes: getEnvIntOrDefault('IDLE_TIMEOUT_MINUTES', 35),
  // AUTH-CONCURRENT-001: Max concurrent sessions (0 = unlimited)
  maxConcurrentSessions: getEnvIntOrDefault('MAX_CONCURRENT_SESSIONS', 3),
  firebase: {
    serviceAccountPath: process.env['FIREBASE_SERVICE_ACCOUNT_PATH'],
    projectId: process.env['FIREBASE_PROJECT_ID'],
    enabled: process.env['FIREBASE_ENABLED'] === 'true',
  },
};

export default config;
