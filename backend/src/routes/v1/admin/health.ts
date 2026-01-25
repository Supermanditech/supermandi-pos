// Admin Health Routes - MED-011: Public health endpoint for admin API
// No authentication required for health checks

import { Router, Request, Response } from "express";

export const adminHealthRouter = Router();

// Git SHA for deployment verification
const GIT_SHA = process.env['GIT_SHA'] || 'dev';

/**
 * GET /api/v1/admin/health
 * Health check endpoint for gateway routing verification
 * Returns version info and git SHA for deployment verification
 * This endpoint is PUBLIC (no admin token required)
 */
adminHealthRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "admin-api",
    version: "3.0.10",
    gitSha: GIT_SHA,
    timestamp: new Date().toISOString(),
  });
});
