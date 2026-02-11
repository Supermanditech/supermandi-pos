// Proxy Routes - V3.0.10 compliant
// Routes requests to appropriate backend services
// P1-001: Fixed body forwarding for PATCH/POST/PUT requests
// GO-LIVE-UI-001: Added x-admin-token forwarding for authenticated admin requests

import { Router, Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Options } from 'http-proxy-middleware';
import type { ClientRequest, IncomingMessage } from 'http';
import { config, ServiceConfig } from '../config';
import { CORRELATION_ID_HEADER } from '../middleware/correlationId';
import { getMasterToken } from '../services/adminSessionService';

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

  // STAGING-FIX-002: Pre-compute target host for Cloud Run GFE Host header validation.
  // Cloud Run's Google Front End rejects requests where Host header doesn't match target.
  // Both changeOrigin and explicit headers option are set to ensure correct Host header.
  let targetHost: string;
  try {
    targetHost = new URL(service.url).host;
  } catch {
    targetHost = '';
  }

  return {
    target: service.url,
    changeOrigin: true,
    // STAGING-FIX-002: Set Host via options.headers (applied in setupOutgoing before request creation)
    headers: targetHost ? { host: targetHost } : undefined,
    pathRewrite,
    // P1-001: Set timeout to 30s to prevent premature connection drops
    proxyTimeout: 30000,
    timeout: 30000,
    onProxyReq: (proxyReq: ClientRequest, req: Request) => {
      // STAGING-FIX-003: Strip headers that cause Cloud Run GFE 400 errors.
      // When proxying between Cloud Run services, the first GFE adds headers like
      // x-forwarded-host that can confuse the second GFE. Remove them.
      proxyReq.removeHeader('x-forwarded-host');
      proxyReq.removeHeader('x-forwarded-server');
      proxyReq.removeHeader('x-cloud-trace-context');
      proxyReq.removeHeader('traceparent');
      proxyReq.removeHeader('x-forwarded-for');
      proxyReq.removeHeader('x-forwarded-proto');
      proxyReq.removeHeader('via');

      // STAGING-FIX-002: Belt-and-suspenders — also set Host in onProxyReq
      if (targetHost) {
        proxyReq.setHeader('host', targetHost);
      }

      // Forward correlation ID to backend service
      if (req.correlationId) {
        proxyReq.setHeader(CORRELATION_ID_HEADER, req.correlationId);
      }

      // GO-LIVE-UI-001: Forward x-admin-token for authenticated admin routes
      // The adminAuthMiddleware has already validated the JWT, so we can safely
      // add the master token header for the backend's requireAdminToken middleware
      if (req.path.startsWith('/api/v1/admin') && req.headers.authorization) {
        const masterToken = getMasterToken();
        if (masterToken) {
          proxyReq.setHeader('x-admin-token', masterToken);
        }
      }

      // P1-001: Handle body forwarding for POST/PUT/PATCH requests ONLY.
      // STAGING-FIX-003: express.json() sets req.body={} even for GET requests.
      // Forwarding a body on GET causes Cloud Run GFE to reject with 400.
      // STAGING-FIX-010: Skip body rewriting for multipart/form-data (file uploads).
      // express.json() doesn't consume multipart streams, so http-proxy can pipe them directly.
      const contentType = req.headers['content-type'] || '';
      const isMultipart = contentType.includes('multipart/form-data');
      const hasBody = req.body !== undefined && req.body !== null;
      const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(req.method);
      if (hasBody && isBodyMethod && !isMultipart) {
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
