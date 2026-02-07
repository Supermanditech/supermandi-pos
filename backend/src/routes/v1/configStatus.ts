/**
 * RO-009: Config Status Endpoint
 *
 * GET /api/v1/config-status
 *
 * Returns boolean readiness for onboarding features.
 * No secrets leaked — only true/false values.
 */

import { Router } from "express";
import { getOnboardingConfig } from "../../config/onboardingConfig";

export const configStatusRouter = Router();

configStatusRouter.get("/config-status", (_req, res) => {
  const config = getOnboardingConfig();

  res.json({
    sms: config.smsEnabled,
    email: config.emailEnabled,
    portalUrl: !!config.portalBaseUrl,
    posAppUrl: !!config.posAppDownloadUrl,
  });
});
