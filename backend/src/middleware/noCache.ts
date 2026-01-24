import { Request, Response, NextFunction } from "express";

/**
 * CACHE-000: Enforce no-cache headers on all dynamic API responses.
 * Prevents browsers, proxies, and CDNs from caching truth data
 * (products, stock, pricing, supplier status, approvals).
 */
export function noCacheHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
}
