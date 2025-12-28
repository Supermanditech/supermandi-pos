import type { NextFunction, Request, Response } from "express";

// If ADMIN_TOKEN is set, require it via X-Admin-Token or Authorization: Bearer.
export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const required = process.env.ADMIN_TOKEN?.trim();
  if (!required) return next();

  const headerToken = req.header("x-admin-token")?.trim();
  const auth = req.header("authorization")?.trim();
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice("bearer ".length).trim() : undefined;
  const token = headerToken || bearer;

  if (!token || token !== required) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
