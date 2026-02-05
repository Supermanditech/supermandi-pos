// Payment Service Configuration
// SM-004: Environment config for Razorpay integration
// ENV-FAILFAST-001: Crash in production if required env vars are missing

const IS_PROD = process.env['NODE_ENV'] === 'production';

export interface PaymentConfig {
  port: number;
  env: string;
  razorpay: {
    keyId: string;
    keySecret: string;
    accountNumber: string;
    webhookSecret: string;
  };
  database: {
    connectionString: string;
  };
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvIntOrDefault(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
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

export const config: PaymentConfig = {
  // CR-HEALTH-001: Cloud Run sets PORT; fall back to service-specific var
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('PAYMENT_SERVICE_PORT', 3011),
  env: getEnvOrDefault('NODE_ENV', 'development'),
  // ENV-FAILFAST-001: Razorpay keys are CRITICAL in production
  razorpay: {
    keyId: requireEnv('RAZORPAY_KEY_ID', ''),
    keySecret: requireEnv('RAZORPAY_KEY_SECRET', ''),
    accountNumber: requireEnv('RAZORPAY_ACCOUNT_NUMBER', ''),
    webhookSecret: getEnvOrDefault('RAZORPAY_WEBHOOK_SECRET', ''),
  },
  // ENV-FAILFAST-001: DATABASE_URL required in production
  database: {
    connectionString: requireEnv(
      'DATABASE_URL',
      'postgres://supermandi:supermandi123@localhost:5432/supermandi'
    ),
  },
};

export default config;
