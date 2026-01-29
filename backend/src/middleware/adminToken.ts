import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";

// ITER3-P1-017: Use timing-safe comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do comparison to prevent length-based timing attacks
    const dummy = Buffer.alloc(32);
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Require ADMIN_TOKEN via X-Admin-Token. Missing token disables admin APIs.
export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const required = process.env.ADMIN_TOKEN?.trim();
  if (!required) {
    res.status(503).json({ error: "admin_disabled" });
    return;
  }

  const token = req.header("x-admin-token")?.trim();

  if (!token || !timingSafeEqual(token, required)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
