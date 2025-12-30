import type { NextFunction, Request, Response } from "express";

// Require ADMIN_TOKEN via X-Admin-Token. Missing token disables admin APIs.
export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const required = process.env.ADMIN_TOKEN?.trim();
  if (!required) {
    res.status(503).json({ error: "admin_disabled" });
    return;
  }

  const token = req.header("x-admin-token")?.trim();

  if (!token || token !== required) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
