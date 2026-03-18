/**
 * RO-009 + CONFIG-CONTRACT: Config Status Endpoint
 *
 * GET /api/v1/config-status
 *
 * Returns boolean readiness for ALL config-dependent features.
 * No secrets leaked — only true/false values.
 *
 * Used by the @config contract smoke test to catch env var wiring
 * mismatches (e.g. code reads REDIS_HOST but compose only sets REDIS_URL).
 */

import { Router } from "express";
import { getOnboardingConfig } from "../../config/onboardingConfig";

export const configStatusRouter = Router();

configStatusRouter.get("/config-status", (_req, res) => {
  const config = getOnboardingConfig();

  res.json({
    // Onboarding features
    sms: config.smsEnabled,
    email: config.emailEnabled,
    portalUrl: !!config.portalBaseUrl,
    posAppUrl: !!config.posAppDownloadUrl,

    // Infrastructure wiring — contract tests assert these are true
    hasRedisHost: !!(process.env.REDIS_HOST || process.env.REDIS_URL),
    hasAdminAllowlist: !!process.env.ADMIN_EMAIL_ALLOWLIST,
    hasSmsProvider: process.env.SMS_DISABLED === "true" || !!process.env.SMS_PROVIDER,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasJwtSecret: !!process.env.JWT_SECRET,

    // V3-FIX-116: Explicit auth capability signal (public, no token required)
    // App boot checks this before routing into phone+OTP flow
    otpAuthEnabled: true,
  });
});
