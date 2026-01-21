// Proxy Routes - V3.0.9 compliant
// Routes requests to appropriate backend services

import { Router, Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Options } from 'http-proxy-middleware';
import type { ClientRequest, IncomingMessage } from 'http';
import { config, ServiceConfig } from '../config';
import { CORRELATION_ID_HEADER } from '../middleware/correlationId';

const router: Router = Router();

/**
 * Create proxy options for a service
 */
function createProxyOptions(service: ServiceConfig): Options {
  // GW-ADMIN-001: Support stripPrefix option (default: true for backward compatibility)
  const shouldStripPrefix = service.stripPrefix !== false;

  return {
    target: service.url,
    changeOrigin: true,
    pathRewrite: shouldStripPrefix
      ? { [`^${service.pathPrefix}`]: '' } // Remove prefix when forwarding
      : undefined, // Keep path as-is when stripPrefix is false
    onProxyReq: (proxyReq: ClientRequest, req: Request) => {
      // Forward correlation ID to backend service
      if (req.correlationId) {
        proxyReq.setHeader(CORRELATION_ID_HEADER, req.correlationId);
      }

      // Log proxy request
      console.log(
        `[PROXY] ${req.method} ${req.path} -> ${service.name} (${service.url})`
      );
    },
    onProxyRes: (proxyRes: IncomingMessage, req: Request) => {
      // Log proxy response
      console.log(
        `[PROXY] ${req.method} ${req.path} <- ${service.name} (${proxyRes.statusCode})`
      );
    },
    onError: (err: Error, req: Request, res: Response) => {
      console.error(
        `[PROXY ERROR] ${req.method} ${req.path} -> ${service.name}: ${err.message}`
      );

      // Check if headers already sent
      if (!res.headersSent) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: `Service ${service.name} is currently unavailable`,
          },
          requestId: req.correlationId,
        });
      }
    },
  };
}

/**
 * Setup proxy routes for all configured services
 */
export function setupProxyRoutes(): Router {
  for (const service of config.services) {
    const proxyOptions = createProxyOptions(service);
    router.use(service.pathPrefix, createProxyMiddleware(proxyOptions));

    console.log(
      `[PROXY] Configured: ${service.pathPrefix} -> ${service.url}`
    );
  }

  return router;
}

export default router;
