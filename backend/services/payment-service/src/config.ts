// Payment Service Configuration
// SM-004: Environment config for Razorpay integration

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

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.warn(`[WARN] Environment variable ${key} is not set`);
    return '';
  }
  return value;
}

export const config: PaymentConfig = {
  // CR-HEALTH-001: Cloud Run sets PORT; fall back to service-specific var
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('PAYMENT_SERVICE_PORT', 3011),
  env: getEnvOrDefault('NODE_ENV', 'development'),
  razorpay: {
    keyId: getRequiredEnv('RAZORPAY_KEY_ID'),
    keySecret: getRequiredEnv('RAZORPAY_KEY_SECRET'),
    accountNumber: getRequiredEnv('RAZORPAY_ACCOUNT_NUMBER'),
    webhookSecret: getEnvOrDefault('RAZORPAY_WEBHOOK_SECRET', ''),
  },
  database: {
    connectionString: getEnvOrDefault(
      'DATABASE_URL',
      'postgres://supermandi:supermandi123@localhost:5432/supermandi'
    ),
  },
};

export default config;
