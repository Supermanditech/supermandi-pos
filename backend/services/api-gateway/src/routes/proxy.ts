// Proxy Routes - V3.0.10 compliant
// Routes requests to appropriate backend services
// P1-001: Fixed body forwarding for PATCH/POST/PUT requests

import { Router, Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Options } from 'http-proxy-middleware';
import type { ClientRequest, IncomingMessage } from 'http';
import { config, ServiceConfig } from '../config';
import { CORRELATION_ID_HEADER } from '../middleware/correlationId';

const router: Router = Router();

/**
 * Create proxy options for a service
 * P1-001: Added proper body forwarding for PATCH/POST/PUT requests
 */
function createProxyOptions(service: ServiceConfig): Options {
  // GW-ADMIN-001: Support stripPrefix option (default: true for backward compatibility)
  const shouldStripPrefix = service.stripPrefix !== false;

  // Determine pathRewrite: rewriteTo takes precedence, then stripPrefix, then no rewrite
  let pathRewrite: Options['pathRewrite'];
  if (service.rewriteTo !== undefined) {
    // Custom rewrite (e.g., /api/v1/pos/enroll -> /enroll)
    pathRewrite = { [`^${service.pathPrefix}`]: service.rewriteTo };
  } else if (shouldStripPrefix) {
    // Strip prefix (e.g., /api/v1/pos/products -> /products)
    pathRewrite = { [`^${service.pathPrefix}`]: '' };
  }
  // else: undefined = keep path as-is

  return {
    target: service.url,
    changeOrigin: true,
    pathRewrite,
    // P1-001: Set timeout to 30s to prevent premature connection drops
    proxyTimeout: 30000,
    timeout: 30000,
    onProxyReq: (proxyReq: ClientRequest, req: Request) => {
      // Forward correlation ID to backend service
      if (req.correlationId) {
        proxyReq.setHeader(CORRELATION_ID_HEADER, req.correlationId);
      }

      // P1-001: Handle body forwarding for POST/PUT/PATCH requests
      // When express.json() or body-parser middleware has already parsed the body,
      // the raw stream is consumed. We need to re-serialize and write it to the proxy request.
      // GO-LIVE-FIX: Forward body even if empty object {} (for validation endpoints)
      if (req.body !== undefined && req.body !== null) {
        const bodyData = JSON.stringify(req.body);
        // Update content-length header to match the actual body size
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        // Write the body data to the proxy request
        proxyReq.write(bodyData);
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
