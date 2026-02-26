// Payment Service Configuration
// SM-004: Environment config for Razorpay integration
// FIX-002: Razorpay vars use graceful degradation (warn + disable), not process.exit().
//   Core POS must run even when Razorpay is not configured.
//   DATABASE_URL still crashes in production (no fallback possible).

import { createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'payment-service', level: process.env.LOG_LEVEL || 'info' });

const IS_PROD = process.env['NODE_ENV'] === 'production';

export interface PaymentConfig {
  port: number;
  env: string;
  razorpay: {
    keyId: string;
    keySecret: string;
    accountNumber: string;
    webhookSecret: string;
    /** true when all 3 required Razorpay keys are present */
    configured: boolean;
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

/** Require env var in production; use dev default otherwise. Crashes on missing. */
function requireEnv(key: string, devDefault: string): string {
  const value = process.env[key];
  if (value) return value;
  if (IS_PROD) {
    logger.error(`[config] FATAL: ${key} is required in production but not set`);
    process.exit(1);
  }
  return devDefault;
}

const razorpayKeyId = getEnvOrDefault('RAZORPAY_KEY_ID', '');
const razorpayKeySecret = getEnvOrDefault('RAZORPAY_KEY_SECRET', '');
const razorpayAccountNumber = getEnvOrDefault('RAZORPAY_ACCOUNT_NUMBER', '');
const razorpayConfigured = !!(razorpayKeyId && razorpayKeySecret && razorpayAccountNumber);

// FIX-002: Log clear startup warning instead of crashing
if (!razorpayConfigured) {
  const missing = [
    !razorpayKeyId && 'RAZORPAY_KEY_ID',
    !razorpayKeySecret && 'RAZORPAY_KEY_SECRET',
    !razorpayAccountNumber && 'RAZORPAY_ACCOUNT_NUMBER',
  ].filter(Boolean);
  logger.warn(
    `[payment-service] WARNING: Razorpay not configured (missing: ${missing.join(', ')}). ` +
    `UPI payments, payouts, and webhook verification are DISABLED. ` +
    `Core POS (scan, checkout, cash) will work normally.`
  );
}

export const config: PaymentConfig = {
  // CR-HEALTH-001: Cloud Run sets PORT; fall back to service-specific var
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('PAYMENT_SERVICE_PORT', 3011),
  env: getEnvOrDefault('NODE_ENV', 'development'),
  razorpay: {
    keyId: razorpayKeyId,
    keySecret: razorpayKeySecret,
    accountNumber: razorpayAccountNumber,
    webhookSecret: getEnvOrDefault('RAZORPAY_WEBHOOK_SECRET', ''),
    configured: razorpayConfigured,
  },
  // DATABASE_URL is truly critical — no service can run without it
  database: {
    connectionString: requireEnv(
      'DATABASE_URL',
      'postgres://localhost:5432/supermandi'
    ),
  },
};

export default config;
