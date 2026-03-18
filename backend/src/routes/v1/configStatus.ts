/**
 * RO-009 + CONFIG-CONTRACT: Config Status Endpoint
 *
 * GET /api/v1/config-status
 *
 * Returns boolean readiness for ALL config-dependent features.
 * No secrets leaked — only true/false values.
 */

import { Router } from "express";
import { getOnboardingConfig } from "../../config/onboardingConfig";
import { getPool } from "../../db/client";

export const configStatusRouter = Router();

// V3-FIX-116: Cache OTP readiness check (refreshes every 60s)
let otpReadyCache: { value: boolean; checkedAt: number } = { value: false, checkedAt: 0 };
const OTP_CHECK_TTL_MS = 60_000;

async function checkOtpAuthReady(): Promise<boolean> {
  const now = Date.now();
  if (now - otpReadyCache.checkedAt < OTP_CHECK_TTL_MS) return otpReadyCache.value;

  try {
    const pool = getPool();
    if (!pool) { otpReadyCache = { value: false, checkedAt: now }; return false; }
    const result = await pool.query(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'pos_otp'"
    );
    const ready = parseInt(result.rows[0]?.count ?? "0", 10) > 0;
    otpReadyCache = { value: ready, checkedAt: now };
    return ready;
  } catch {
    otpReadyCache = { value: false, checkedAt: now };
    return false;
  }
}

configStatusRouter.get("/config-status", async (_req, res) => {
  const config = getOnboardingConfig();
  const otpAuthEnabled = await checkOtpAuthReady();

  res.json({
    // Onboarding features
    sms: config.smsEnabled,
    email: config.emailEnabled,
    portalUrl: !!config.portalBaseUrl,
    posAppUrl: !!config.posAppDownloadUrl,

    // Infrastructure wiring
    hasRedisHost: !!(process.env.REDIS_HOST || process.env.REDIS_URL),
    hasAdminAllowlist: !!process.env.ADMIN_EMAIL_ALLOWLIST,
    hasSmsProvider: process.env.SMS_DISABLED === "true" || !!process.env.SMS_PROVIDER,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasJwtSecret: !!process.env.JWT_SECRET,

    // V3-FIX-116: Real auth capability — checks pos_otp table exists
    otpAuthEnabled,
  });
});
