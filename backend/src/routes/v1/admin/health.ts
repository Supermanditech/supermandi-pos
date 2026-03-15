// Admin Health Routes - GL-CRIT-0048: Split health endpoints
// /health - Basic status (public)
// /health/detailed - Full info (authenticated)

import { Router, Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { getEmailProviderInfo } from "../../../services/emailService";

export const adminHealthRouter = Router();

// Git SHA for deployment verification
// LIVE.API.HEALTH_GITSHA_ENV_PARITY.001: Standardize fallback to 'unknown' matching Docker ARG default
const GIT_SHA = process.env['GIT_SHA'] || 'unknown';
const BUILD_TIME = process.env['BUILD_TIME'] || new Date().toISOString();
const ADMIN_TOKEN = process.env['ADMIN_TOKEN'] || '';

// GL-CRIT-0048: Simple admin token middleware for detailed health
function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (!ADMIN_TOKEN) {
    res.status(500).json({ error: { code: 'CONFIG_ERROR', message: 'Admin token not configured' } });
    return;
  }

  // STG-499: Use timing-safe comparison to prevent character-by-character timing attacks
  if (!token || token.length !== ADMIN_TOKEN.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_TOKEN))) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing admin token' } });
    return;
  }

  next();
}

/**
 * GET /api/v1/admin/health
 * GL-CRIT-0048: Basic health check endpoint (PUBLIC)
 * Returns minimal status for load balancers and basic monitoring
 */
// URL-004: Public health returns ONLY status — no config details
adminHealthRouter.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

/**
 * GET /api/v1/admin/health/detailed
 * GL-CRIT-0048: Detailed health check endpoint (AUTHENTICATED)
 * Returns version info, git SHA, and infrastructure details
 */
adminHealthRouter.get("/health/detailed", requireAdminToken, (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "admin-api",
    version: "3.0.10",
    gitSha: GIT_SHA,
    buildTime: BUILD_TIME,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    // GO-LIVE: Email service status for verification
    email: getEmailProviderInfo(),
  });
});
