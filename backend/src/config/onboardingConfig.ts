/**
 * RO-009: Config Closure + URL Consistency
 *
 * Validates required env vars for onboarding on startup.
 * - Production: missing vars → fail fast with clear error
 * - Development: missing vars → warning log, not crash
 * - SMS_DISABLED=true / EMAIL_DISABLED=true → explicitly skips
 */

export interface OnboardingConfig {
  smsEnabled: boolean;
  smsProvider: string | null;
  emailEnabled: boolean;
  emailProvider: string | null;
  portalBaseUrl: string | null;
  posAppDownloadUrl: string | null;
}

let _config: OnboardingConfig | null = null;

/**
 * Load and validate onboarding config from env vars.
 * Call once during startup.
 */
export function loadOnboardingConfig(): OnboardingConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const missing: string[] = [];

  // SMS
  const smsDisabled = process.env.SMS_DISABLED === "true";
  const smsProvider = process.env.SMS_PROVIDER || null;
  const smsEnabled = !smsDisabled && !!smsProvider;
  if (!smsDisabled && !smsProvider) {
    missing.push("SMS_PROVIDER (or set SMS_DISABLED=true)");
  }

  // Email
  const emailDisabled = process.env.EMAIL_DISABLED === "true";
  const emailProvider = process.env.EMAIL_PROVIDER || null;
  const emailEnabled = !emailDisabled && !!emailProvider;
  if (!emailDisabled && !emailProvider) {
    missing.push("EMAIL_PROVIDER (or set EMAIL_DISABLED=true)");
  }

  // URLs
  const portalBaseUrl = process.env.PORTAL_BASE_URL || null;
  const posAppDownloadUrl = process.env.POS_APP_DOWNLOAD_URL || null;
  if (!portalBaseUrl) {
    missing.push("PORTAL_BASE_URL");
  }
  if (!posAppDownloadUrl) {
    missing.push("POS_APP_DOWNLOAD_URL");
  }

  if (missing.length > 0) {
    const msg = `[RO-009] Missing onboarding env vars:\n${missing.map((v) => `  - ${v}`).join("\n")}`;
    if (isProduction) {
      console.error(msg);
      throw new Error(msg);
    } else {
      console.warn(msg);
      console.warn("[RO-009] Continuing in dev mode — some features will be disabled");
    }
  }

  _config = {
    smsEnabled,
    smsProvider,
    emailEnabled,
    emailProvider,
    portalBaseUrl,
    posAppDownloadUrl,
  };

  console.log("[RO-009] Onboarding config loaded:", {
    sms: smsEnabled ? smsProvider : "disabled",
    email: emailEnabled ? emailProvider : "disabled",
    portalUrl: portalBaseUrl ? "set" : "missing",
    posAppUrl: posAppDownloadUrl ? "set" : "missing",
  });

  return _config;
}

/**
 * Get the current onboarding config. Returns defaults if not loaded.
 */
export function getOnboardingConfig(): OnboardingConfig {
  if (!_config) {
    return {
      smsEnabled: false,
      smsProvider: null,
      emailEnabled: false,
      emailProvider: null,
      portalBaseUrl: null,
      posAppDownloadUrl: null,
    };
  }
  return _config;
}
