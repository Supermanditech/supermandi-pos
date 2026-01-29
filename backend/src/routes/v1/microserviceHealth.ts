// Microservice Health Endpoints - AUD-076-A/AUD-999
// Provides health endpoints for "logical" microservices in monolith deployment
// These endpoints respond to /api/v1/{service}/health requests that the gateway forwards

import { Router, Request, Response } from "express";
import { getPool } from "../../db/client";

export const microserviceHealthRouter = Router();

// Common version info
const VERSION = "3.0.10";
const GIT_SHA = process.env['GIT_SHA'] || 'dev';

// Database health check helper
async function checkDbConnection(): Promise<boolean> {
  try {
    const pool = getPool();
    if (!pool) return false;
    const result = await pool.query('SELECT 1');
    return result.rowCount === 1;
  } catch {
    return false;
  }
}

/**
 * GET /api/v1/inventory/health
 * Health check for inventory service (logical microservice in monolith)
 */
microserviceHealthRouter.get("/inventory/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDbConnection();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'inventory-service',
    version: VERSION,
    gitSha: GIT_SHA,
    database: dbHealthy ? 'connected' : 'disconnected',
    deployment: 'monolith',
  });
});

/**
 * GET /api/v1/orders/health
 * Health check for orders service (logical microservice in monolith)
 */
microserviceHealthRouter.get("/orders/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDbConnection();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'order-service',
    version: VERSION,
    gitSha: GIT_SHA,
    database: dbHealthy ? 'connected' : 'disconnected',
    deployment: 'monolith',
  });
});

/**
 * GET /api/v1/catalog/health
 * Health check for catalog service (logical microservice in monolith)
 */
microserviceHealthRouter.get("/catalog/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDbConnection();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'catalog-service',
    version: VERSION,
    gitSha: GIT_SHA,
    database: dbHealthy ? 'connected' : 'disconnected',
    deployment: 'monolith',
  });
});

/**
 * GET /api/v1/suppliers/health
 * Health check for suppliers service (logical microservice in monolith)
 */
microserviceHealthRouter.get("/suppliers/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDbConnection();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'supplier-service',
    version: VERSION,
    gitSha: GIT_SHA,
    database: dbHealthy ? 'connected' : 'disconnected',
    deployment: 'monolith',
  });
});

/**
 * GET /api/v1/reorder/health
 * Health check for reorder service (logical microservice in monolith)
 */
microserviceHealthRouter.get("/reorder/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDbConnection();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'reorder-service',
    version: VERSION,
    gitSha: GIT_SHA,
    database: dbHealthy ? 'connected' : 'disconnected',
    deployment: 'monolith',
  });
});

/**
 * GET /api/v1/voice/health
 * Health check for voice service (logical microservice in monolith)
 * GO-LIVE: Migrated from Claude/Anthropic to OpenAI
 */
microserviceHealthRouter.get("/voice/health", async (_req: Request, res: Response) => {
  const openaiConfigured = Boolean(process.env['OPENAI_API_KEY']);

  res.status(200).json({
    status: 'ok',
    service: 'voice-service',
    version: '2.0.0', // GO-LIVE: OpenAI migration
    gitSha: GIT_SHA,
    provider: 'openai',
    configured: openaiConfigured,
    openai: openaiConfigured ? 'configured' : 'not_configured',
    deployment: 'monolith',
  });
});

/**
 * GET /api/v1/platform/health
 * Health check for platform service (logical microservice in monolith)
 */
microserviceHealthRouter.get("/platform/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDbConnection();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'platform-service',
    version: VERSION,
    gitSha: GIT_SHA,
    database: dbHealthy ? 'connected' : 'disconnected',
    deployment: 'monolith',
  });
});

/**
 * GET /api/v1/auth/health
 * Health check for auth service (logical microservice in monolith)
 */
microserviceHealthRouter.get("/auth/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDbConnection();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'auth-service',
    version: VERSION,
    gitSha: GIT_SHA,
    database: dbHealthy ? 'connected' : 'disconnected',
    deployment: 'monolith',
  });
});
