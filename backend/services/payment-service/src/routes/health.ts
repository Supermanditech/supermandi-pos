// Health Check Routes
// SM-004: Health endpoint with Razorpay connection status

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { healthCheck } from '@supermandi/common';
import { checkRazorpayConnection } from '../services/razorpayClient';
import { config } from '../config';

const router: RouterType = Router();

/**
 * GET /health
 * Full health check including database and Razorpay connection
 */
router.get('/health', async (_req: Request, res: Response) => {
  const dbHealthy = await healthCheck();
  const razorpayConnected = await checkRazorpayConnection();

  const isHealthy = dbHealthy;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'payment-service',
    version: '1.0.0',
    database: dbHealthy ? 'connected' : 'disconnected',
    razorpay: razorpayConnected ? 'connected' : 'not_configured',
    environment: config.env,
  });
});

/**
 * GET /healthz
 * Lightweight liveness probe
 */
router.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'payment-service',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /version
 * CR-VERSION-001: Version endpoint for Cloud Run deploy verification
 */
router.get('/version', (_req: Request, res: Response) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'payment-service',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

/**
 * GET /ready
 * Readiness probe - checks if service can handle requests
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const dbHealthy = await healthCheck();

  if (dbHealthy) {
    res.status(200).json({
      status: 'ready',
      service: 'payment-service',
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      service: 'payment-service',
      reason: 'database_unavailable',
    });
  }
});

export default router;
